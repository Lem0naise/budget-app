'use client';

import type { Database } from '@/types/supabase';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import ManageBudgetModal from "../components/manage-budget-modal";
import MobileNav from "../components/mobileNav";
import Navbar from "../components/navbar";
import ProtectedRoute from '../components/protected-route';
import Sidebar from "../components/sidebar";
import CategoryCard from '../features/Category';
import AccountModal from '../components/account-modal';
import Link from 'next/link';


type CategoryFromDB = Database['public']['Tables']['categories']['Row'];
type Assignment = Database['public']['Tables']['assignments']['Row'];

type Category = {
    id: CategoryFromDB['id'];
    name: CategoryFromDB['name'];
    assigned: number;
    spent: number;
    goalAmount: CategoryFromDB['goal'];
    group: string;
    rollover: number;
    available: number;
    dailyLeft?: number; // Amount available per day for rest of month
};

export default function Budget() {
    const router = useRouter();
    const supabase = createClientComponentClient<Database>();
    const [categories, setCategories] = useState<Category[]>([]);
    const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
    const [monthString, setMonthString] = useState(`${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`)
    const [activeGroup, setActiveGroup] = useState<string>('All');
    const [showManageModal, setShowManageModal] = useState(false);
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [balanceInfo, setBalanceInfo] = useState<{ budgetPool: number; assigned: number } | null>(null);
    const [wasMassAssigningSoShouldClose, setwasMassAssigningSoShouldClose] = useState(false);
    const [isMassAssigning, setIsMassAssigning] = useState(false);
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const [hideBudgetValues, setHideBudgetValues] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [showOverspentAlert, setShowOverspentAlert] = useState(false);
    const [reminderText, setReminderText] = useState<string>('');
    const [reminderLoading, setReminderLoading] = useState(false);
    const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);

    // Update month string when current month changes
    useEffect(() => {
        const newMonthString = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
        setMonthString(newMonthString);
        fetchBudgetData(); // Fetch new data when month changes
        // Remove separate fetchReminderData call - now included in fetchBudgetData
    }, [currentMonth]);

    // Listen for hide budget values changes
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedHideBudgetValues = localStorage.getItem('hideBudgetValues') === 'true';
            setHideBudgetValues(savedHideBudgetValues);

            const handleHideBudgetValuesChange = (event: CustomEvent) => {
                setHideBudgetValues(event.detail.hideBudgetValues);
            };

            window.addEventListener('hideBudgetValuesChanged', handleHideBudgetValuesChange as EventListener);
            return () => {
                window.removeEventListener('hideBudgetValuesChanged', handleHideBudgetValuesChange as EventListener);
            };
        }
    }, []);

    const formatMonth = (date: Date) => {
        return date.toLocaleDateString('en-GB', {
            month: 'long',
            year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
        });
    };

    const goToPreviousMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
    };

    const goToNextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
    };

    // Helper function to calculate rollover for a category up to a specific month
    const calculateRolloverForCategory = useCallback((
        categoryId: string, 
        targetMonth: string, 
        allAssignments: Assignment[], 
        allTransactions: any[]
    ): number => {
        if (!categoryId) return 0;

        // Get all months from category creation up to target month
        const targetDate = new Date(targetMonth + '-01');
        const months: string[] = [];
        
        // Start from 12 months ago to ensure we capture enough history
        const startDate = new Date(targetDate);
        startDate.setMonth(startDate.getMonth() - 12);
        
        let currentDate = new Date(startDate);
        while (currentDate <= targetDate) {
            const monthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
            if (monthStr < targetMonth) { // Only include months before target
                months.push(monthStr);
            }
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        let rollover = 0;
        
        // Calculate rollover month by month
        for (const month of months) {
            const assignment = allAssignments.find(a => a.category_id === categoryId && a.month === month);
            const assigned = assignment?.assigned || 0;
            
            // Calculate spending for this month
            const monthStart = month + '-01';
            const nextMonth = new Date(monthStart);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            const monthEnd = new Date(nextMonth.getTime() - 1).toISOString().split('T')[0];
            
            const monthSpent = allTransactions
                .filter(t => t.category_id === categoryId && 
                            t.date >= monthStart && 
                            t.date <= monthEnd &&
                            t.type === 'payment')
                .reduce((sum, t) => sum + Math.abs(t.amount), 0);
            
            // Add to rollover: assigned + previous rollover - spent
            rollover = rollover + assigned - monthSpent;
            
            // Rollover CAN be negative
        }
        
        return rollover;
    }, []);

    // Helper function to calculate days remaining in current month
    const getDaysRemainingInMonth = useCallback((date: Date = currentMonth): number => {
        const today = new Date();
        const currentDate = new Date(date.getFullYear(), date.getMonth(), today.getDate());
        const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        // If we're viewing a future month, return total days in that month
        if (date.getMonth() > today.getMonth() || date.getFullYear() > today.getFullYear()) {
            return lastDayOfMonth.getDate();
        }
        
        // If we're viewing a past month, return 0
        if (date.getMonth() < today.getMonth() || date.getFullYear() < today.getFullYear()) {
            return 0;
        }
        
        // For current month, calculate remaining days including today
        const daysRemaining = lastDayOfMonth.getDate() - today.getDate() + 1;
        return Math.max(0, daysRemaining);
    }, [currentMonth]);

    // Memoize fetchBudgetData to prevent unnecessary recreations
    const fetchBudgetData = useCallback(async () => {
        try {
            setLoading(true);
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) throw new Error('Not authenticated');

            // Get first and last day of the selected month
            const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
            const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

            // Format dates for database query - use local timezone instead of UTC
            const startDate = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-${String(firstDay.getDate()).padStart(2, '0')}`;
            const endDate = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

            // Format current month for assignments query
            const queryMonthString = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
            setMonthString(queryMonthString);

            // Fetch ALL data for rollover calculations and budget pool, including reminder data
            const [categoriesResponse, transactionsResponse, assignmentsResponse, allTransactionsResponse, allAssignmentsResponse, reminderResponse] = await Promise.all([
                supabase
                    .from('categories')
                    .select(`
                        *,
                        groups (
                            id,
                            name
                        )
                    `)
                    .eq('user_id', user.id)
                    .order('created_at'),
                supabase
                    .from('transactions')
                    .select('amount, category_id, type')
                    .eq('user_id', user.id)
                    .gte('date', startDate)
                    .lte('date', endDate),
                supabase
                    .from('assignments')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('month', queryMonthString),
                supabase
                    .from('transactions')
                    .select('amount, category_id, type, date')
                    .eq('user_id', user.id),
                supabase
                    .from('assignments')
                    .select('*')
                    .eq('user_id', user.id),
                supabase
                    .from('information')
                    .select('reminder')
                    .eq('user_id', user.id)
                    .eq('month', queryMonthString)
                    .single()
            ]);

            if (categoriesResponse.error) throw categoriesResponse.error;
            if (transactionsResponse.error) throw transactionsResponse.error;
            if (assignmentsResponse.error) throw assignmentsResponse.error;
            if (allTransactionsResponse.error) throw allTransactionsResponse.error;
            if (allAssignmentsResponse.error) throw allAssignmentsResponse.error;
            // Don't throw error for reminder response - it's okay if no reminder exists

            const categoriesData = categoriesResponse.data;
            const transactionsData = transactionsResponse.data;
            const assignmentsData = assignmentsResponse.data;
            const allTransactionsData = allTransactionsResponse.data;
            const allAssignments = allAssignmentsResponse.data;

            // Handle reminder data
            if (reminderResponse.error && reminderResponse.error.code !== 'PGRST116') {
                console.error('Error fetching reminder:', reminderResponse.error);
            }
            setReminderText(reminderResponse.data?.reminder || '');

            let startingBalance = 0;
            let totalIncome = 0;
            // Calculate spent amounts for each category
            const spentByCategory: { [key: string]: number } = {};
            
            // Get starting balance and total income from ALL transactions
            allTransactionsData?.forEach(transaction => {
                if (transaction.type == 'starting') {startingBalance += transaction.amount;}
                if (transaction.type == 'income') {totalIncome += transaction.amount;}
            });

            // Calculate spending for current month only
            transactionsData?.forEach(transaction => {
                if (!spentByCategory[transaction.category_id]) {
                    spentByCategory[transaction.category_id] = 0;
                }
                // Only include negative amounts (expenses) in spent calculation
                if (transaction.type === 'payment') {
                    spentByCategory[transaction.category_id] += Math.abs(transaction.amount);
                }
            });

            // Create a map of assignments by category ID
            const assignmentsByCategory = assignmentsData.reduce((acc, assignment) => {
                acc[assignment.category_id] = assignment;
                return acc;
            }, {} as Record<string, typeof assignmentsData[0]>);

            // Calculate categories with assignments and rollovers
            const categoriesWithSpent = categoriesData.map(category => {
                const assignment = assignmentsByCategory[category.id];
                const assigned = assignment?.assigned ?? 0;
                const spent = spentByCategory[category.id] || 0;
                
                // Calculate rollover if enabled
                const rollover =  calculateRolloverForCategory(category.id, queryMonthString, allAssignments || [], allTransactionsData);
                
                const available = assigned + rollover - spent;
                
                // Calculate daily amount left
                const daysRemaining = getDaysRemainingInMonth();
                const dailyLeft = daysRemaining > 0 ? available / daysRemaining : 0;
                
                return {
                    id: category.id,
                    name: category.name,
                    assigned,
                    spent,
                    goalAmount: category.goal || 0,
                    group: category.groups?.name || 'Uncategorized',
                    rollover,
                    available,
                    dailyLeft
                };
            });
            
            // Calculate total assigned amount across ALL months (for budget pool calculation)
            const totalAssignedAllTime = allAssignments?.reduce((total, assignment) => total + (assignment.assigned || 0), 0) || 0;
            const totalBudgetPoolThisMonth = startingBalance + totalIncome;
            const totalAssignedCurrentMonth = categoriesWithSpent.reduce((total, cat) => total + cat.assigned, 0);

            // Update balance info
            setBalanceInfo({
                budgetPool: totalBudgetPoolThisMonth,
                assigned: totalAssignedAllTime // Use total assigned across all months
            });
            
            setCategories(categoriesWithSpent);
            setError(null);
        } catch (error) {
            console.error('Error fetching budget data:', error);
            setError('Failed to load budget data. Please try again in a second.');
        } finally {
            setLoading(false);
        }
    }, [currentMonth, supabase, calculateRolloverForCategory, getDaysRemainingInMonth]);


    const handleAssignmentUpdate = async (categoryId: string, newAmount: number, toToast: boolean = true) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');
            
            // Get current assignment for this category/month to calculate difference
            const { data: currentAssignment } = await supabase
                .from('assignments')
                .select('assigned')
                .eq('category_id', categoryId)
                .eq('month', monthString)
                .eq('user_id', user.id)
                .single();
            
            const currentAssigned = currentAssignment?.assigned || 0;
            const assignmentDifference = newAmount - currentAssigned;
            
            // Calculate the new total assigned amount before making the API call
            const updatedCategories = categories.map(cat => {
                if (cat.id === categoryId) {
                    // Recalculate available when assigned changes
                    const newAvailable = newAmount + cat.rollover - cat.spent;
                    const daysRemaining = getDaysRemainingInMonth();
                    const dailyLeft = daysRemaining > 0 ? newAvailable / daysRemaining : 0;
                    return { ...cat, assigned: newAmount, available: newAvailable, dailyLeft };
                }
                return cat;
            });

            // Update local state immediately
            setCategories(updatedCategories);
            if (balanceInfo) {
                setBalanceInfo({
                    ...balanceInfo,
                    assigned: balanceInfo.assigned + assignmentDifference // Add the difference to total assigned
                });
            }

            const promise = (async () => {
                const { error } = await supabase
                    .from('assignments')
                    .upsert({
                        category_id: categoryId,
                        month: monthString,
                        assigned: newAmount,
                        user_id: user.id
                    }, {onConflict: 'category_id,month'});
                if (error) throw error;
            })();

            if (toToast) {
                    await toast.promise(promise, {
                    loading: 'Updating assignment...',
                    success: 'Updated assignment successfully!',
                    error: 'Failed to update assignment'
                });
            }
        } catch (error) {
            console.error('Error updating assignment:', error);
            // Revert the local state changes on error
            setCategories(cats => cats.map(cat => 
                cat.id === categoryId ? { ...cat, assigned: cat.assigned } : cat
            ));
            // Refresh data to ensure consistency
            await fetchBudgetData();
            throw error;
        }
    };

    const updateCategoriesInMass = async () => {
        let updatedCategories = [...categories];

        try {
            // Start by collecting all changes to make
            const changes = new Map();
            
            // Get categories from the active group only
            const targetCategories = activeGroup === 'All' 
                ? categories 
                : categories.filter(cat => cat.group === activeGroup);

            // Handle different mass actions
            if (pendingAction === 'fill-goals') {
                targetCategories.forEach(category => {
                    const goal = category.goalAmount || 0;
                    if (goal > category.assigned) {
                        changes.set(category.id, goal);
                    }
                });
            } else if (pendingAction === 'clear') {
                targetCategories.forEach(category => {
                    changes.set(category.id, 0);
                });
            } else {
                // Handle manual input changes
                const categoryInputs = document.querySelectorAll('input[data-category-id]') as NodeListOf<HTMLInputElement>;
                categoryInputs.forEach(input => {
                    const name = input.dataset.categoryId;
                    if (!name) return;
                    
                    const category = categories.find(c => c.name === name);
                    if (!category) return;
                    
                    const newAmount = parseFloat(input.value);
                    if (!isNaN(newAmount) && newAmount !== category.assigned) {
                        changes.set(category.id, newAmount);
                    }
                });
            }

            // If there are no changes, exit early
            if (changes.size === 0) {
                return;
            }

            // Calculate total assignment difference for balance info update
            let totalDifference = 0;
            for (const [categoryId, newAmount] of changes.entries()) {
                const category = categories.find(c => c.id === categoryId);
                if (category) {
                    totalDifference += newAmount - category.assigned;
                }
            }

            // Update local state first for immediate feedback
            updatedCategories = categories.map(cat => {
                const newAmount = changes.get(cat.id);
                if (newAmount !== undefined) {
                    // Recalculate available when assigned changes
                    const newAvailable = newAmount + cat.rollover - cat.spent;
                    const daysRemaining = getDaysRemainingInMonth();
                    const dailyLeft = daysRemaining > 0 ? newAvailable / daysRemaining : 0;
                    return { ...cat, assigned: newAmount, available: newAvailable, dailyLeft };
                }
                return cat;
            });

            // Update UI state immediately
            setCategories(updatedCategories);
            if (balanceInfo) {
                setBalanceInfo({
                    ...balanceInfo,
                    assigned: balanceInfo.assigned + totalDifference
                });
            }

            // Prepare all database updates
            const updates = Array.from(changes.entries()).map(([categoryId, amount]) => 
                handleAssignmentUpdate(categoryId, amount, false),
            );

            // Execute all updates in parallel
            if (updates.length > 0) {
                const actionDesc = pendingAction === 'fill-goals' ? 'Filling goals' 
                    : pendingAction === 'clear' ? 'Clearing assignments' 
                    : 'Updating assignments';

                await toast.promise(Promise.all(updates), {
                    loading: `${actionDesc}...`,
                    success: `Updated ${updates.length.toString()} categories successfully!`,
                    error: 'Failed to complete some updates'
                });
            }

            // After successful update, refetch data to ensure consistency
            await fetchBudgetData();

        } catch (error) {
            console.error('Error updating assignments:', error);
            // On error, refresh data to ensure consistency
            await fetchBudgetData();
            throw error;
        }
    };

    const massAssign = async () => {
        if (isMassAssigning) {
            try {
                await updateCategoriesInMass();
            } finally {
                setIsMassAssigning(false);
                setPendingAction(null);
            }
        } else {
            setIsMassAssigning(true);
            setwasMassAssigningSoShouldClose(true);
        }
    };

    const expandOverspent = async () => {
        if (!showOverspentAlert) {
            setShowOverspentAlert(true);
            expandOverspentGroups();
        } else {
            setShowOverspentAlert(false);
        }
    }
    
    const groups = ['All', ...new Set(categories.map(cat => cat.group))];
    const filteredCategories = activeGroup === 'All' 
        ? categories 
        : categories.filter(cat => cat.group === activeGroup);
    
    // Group categories by their group
    const groupedCategories = categories.reduce((acc, category) => {
        const groupName = category.group || 'Uncategorized';
        if (!acc[groupName]) {
            acc[groupName] = [];
        }
        acc[groupName].push(category);
        return acc;
    }, {} as Record<string, Category[]>);

    // Helper function to format currency or return asterisks
    const formatCurrency = (amount: number) => {
        if (hideBudgetValues) return '****';
        return `£${Math.abs(amount).toFixed(2)}`;
    };

    // Helper function to get group totals
    const getGroupTotals = (groupCategories: Category[]) => {
        const totalAssigned = groupCategories.reduce((sum, cat) => sum + cat.assigned, 0);
        const totalRollover = groupCategories.reduce((sum, cat) => sum + cat.rollover, 0);
        const totalSpent = groupCategories.reduce((sum, cat) => sum + cat.spent, 0);
        const totalAvailable = groupCategories.reduce((sum, cat) => sum + cat.available, 0);
        return { totalAssigned, totalRollover, totalSpent, totalAvailable };
    };

    const toggleGroup = (groupName: string) => {
        setExpandedGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(groupName)) {
                newSet.delete(groupName);
            } else {
                newSet.add(groupName);
            }
            return newSet;
        });
    };

    const toggleAllGroups = () => {
        const groups = Array.from(new Set(categories.map(cat => cat.group)));
        const allExpanded = groups.every(group => expandedGroups.has(group));
        
        if (allExpanded) {
            setExpandedGroups(new Set());
        } else {
            setExpandedGroups(new Set(groups));
        }
    };

    // Helper function to get overspent categories
    const getOverspentCategories = () => {
        return categories.filter(cat => cat.available < 0);
    };

    // Helper function to calculate total overspent amount
    const getTotalOverspent = () => {
        return getOverspentCategories().reduce((sum, cat) => sum + Math.abs(cat.available), 0);
    };

    // Helper function to expand groups containing overspent categories
    const expandOverspentGroups = () => {
        const overspentCategories = getOverspentCategories();
        const groupsToExpand = new Set([...expandedGroups]);
        overspentCategories.forEach(cat => {
            groupsToExpand.add(cat.group);
        });
        setExpandedGroups(groupsToExpand);
    };

    // Fetch reminder data
    const fetchReminderData = useCallback(async () => {
        try {
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return;

            const { data, error } = await supabase
                .from('information')
                .select('reminder')
                .eq('user_id', user.id)
                .eq('month', monthString)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
                console.error('Error fetching reminder:', error);
                return;
            }

            setReminderText(data?.reminder || '');
        } catch (error) {
            console.error('Error fetching reminder data:', error);
        }
    }, [supabase, monthString]);

    // Save reminder data with debouncing
    const saveReminderData = useCallback(async (text: string) => {
        try {
            setReminderLoading(true);
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('information')
                .upsert({
                    user_id: user.id,
                    month: monthString,
                    reminder: text || null
                }, {
                    onConflict: 'user_id,month'
                });

            if (error) throw error;
        } catch (error) {
            console.error('Error saving reminder:', error);
            toast.error('Failed to save reminder');
        } finally {
            setReminderLoading(false);
        }
    }, [supabase, monthString]);

    // Handle reminder text change with debounced save
    const handleReminderChange = (text: string) => {
        setReminderText(text);
        
        // Clear existing timeout
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        
        // Set new timeout for auto-save
        const newTimeout = setTimeout(() => {
            saveReminderData(text);
        }, 1000); // Save after 1 second of no typing
        
        setSaveTimeout(newTimeout);
    };

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveTimeout) {
                clearTimeout(saveTimeout);
            }
        };
    }, [saveTimeout]);

    return(
        <ProtectedRoute>
            <div className="min-h-screen bg-background font-[family-name:var(--font-suse)]">
                <div className="hidden md:block"><Navbar /></div>
                <Sidebar />
                <MobileNav />
                

                {/* Mobile month switcher and manage button */}
                <div className="px-3 flex md:hidden z-50 items-center border-b border-white/[.2] min-w-screen py-2">
                    <div className="w-12 flex justify-start">
                        <button
                            onClick={toggleAllGroups}
                            className="p-1.5 rounded-lg transition-all hover:bg-white/[.05] invert opacity-70 hover:opacity-100"
                        >
                            <Image
                                src={Object.keys(groupedCategories).every(group => expandedGroups.has(group)) ? "/minus.svg" : "/plus.svg"}
                                alt={Object.keys(groupedCategories).every(group => expandedGroups.has(group)) ? "Collapse all" : "Expand all"}
                                width={18}
                                height={18}
                                className="opacity-70"
                            />
                        </button>
                    </div>
                    <div className="flex-1 flex justify-center">
                        <div className="flex items-center">
                            <button 
                                onClick={goToPreviousMonth}
                                className="p-1.5 rounded-lg transition-all hover:bg-white/[.05] opacity-70 hover:opacity-100"
                            >
                                <Image
                                    src="/chevron-left.svg"
                                    alt="Previous month"
                                    width={32}
                                    height={32}
                                    className="opacity-90"
                                />
                            </button>
                            <h2 className="text-base font-medium min-w-[120px] text-center">
                                {formatMonth(currentMonth)}
                            </h2>
                            <button 
                                onClick={goToNextMonth}
                                className="p-1.5 rounded-lg transition-all hover:bg-white/[.05] opacity-70 hover:opacity-100"
                            >
                                <Image
                                    src="/chevron-right.svg"
                                    alt="Next month"
                                    width={32}
                                    height={32}
                                    className="opacity-90"
                                />
                            </button>
                        </div>
                    </div>
                    <div className="w-12 flex justify-end">
                        <button 
                            onClick={() => setShowManageModal(true)}
                            className="flex gap-2 p-1.5 rounded-lg transition-all hover:bg-white/[.05] opacity-70 hover:opacity-100"
                        >
                            <Image
                                src="/settings.svg"
                                alt="Manage budget"
                                width={18}
                                height={18}
                                className="opacity-70"
                            />
                        </button>
                    </div>
                </div>

                {/* Toast notifications */}
                <Toaster 
                    containerClassName='mb-[15dvh]'
                    position="bottom-center"
                    toastOptions={{
                        style: {
                            background: '#333',
                            color: '#fff',
       
                        },
                        success: {
                            iconTheme: {
                                primary: '#bac2ff',
                                secondary: '#fff',
                            },
                        },
                        error: {
                            iconTheme: {
                                primary: '#EF4444',
                                secondary: '#fff',
                            },
                        }
        
                    }}
                />

                <main className="pt-2 md:pt-12 pb-24 md:pb-6 
                        sm:ml-20 lg:ml-[max(16.66%,100px)] px-4 md:px-6 fade-in">
                    <div className="max-w-7xl mx-auto md:mt-5">
                        <div className="md:flex hidden items-center mb-6 md:mt-3">
                            <div className="flex-1 min-w-0">
                                <h1 className="text-2xl font-bold tracking-[-.01em]">Budget</h1>
                            </div>
                            <div className="flex-shrink-0 flex justify-center mx-4 lg:mx-8">
                                <div className="flex items-center gap-1 lg:gap-2">
                                    <button 
                                        onClick={goToPreviousMonth}
                                        className="flex-shrink-0 p-1.5 lg:p-2 rounded-lg transition-all hover:bg-white/[.05] opacity-70 hover:opacity-100"
                                    >   
                                        <Image
                                            src="/chevron-left.svg"
                                            alt="Previous month"
                                            width={32}
                                            height={32}
                                            className="lg:w-9 lg:h-9 opacity-70"
                                        />
                                    </button>
                                    <h2 className="text-base lg:text-lg font-medium min-w-[100px] lg:min-w-[140px] text-center whitespace-nowrap">
                                        {formatMonth(currentMonth)}
                                    </h2>
                                    <button 
                                        onClick={goToNextMonth}
                                        className="flex-shrink-0 p-1.5 lg:p-2 rounded-lg transition-all hover:bg-white/[.05] opacity-70 hover:opacity-100"
                                    >
                                        <Image
                                            src="/chevron-right.svg"
                                            alt="Next month"
                                            width={32}
                                            height={32}
                                            className="lg:w-9 lg:h-9 opacity-70"
                                        />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 flex justify-end gap-2 min-w-0">
                                <button
                                    onClick={toggleAllGroups}
                                    className="bg-white/[.05] hover:bg-white/[.1] px-3 lg:px-4 py-2 rounded-lg flex items-center gap-2 opacity-70 hover:opacity-100 transition-all text-sm whitespace-nowrap"
                                >
                                    <span className="hidden xl:inline">{Object.keys(groupedCategories).every(group => expandedGroups.has(group)) ? 'Collapse All' : 'Expand All'}</span>
                                    <span className="xl:hidden">{Object.keys(groupedCategories).every(group => expandedGroups.has(group)) ? 'Collapse' : 'Expand'}</span>
                                </button>
                                <button
                                    onClick={() => setShowManageModal(true)}
                                    className="bg-primary hover:bg-white/[.05] px-3 lg:px-4 py-2 rounded-lg flex items-center gap-2 opacity-70 hover:opacity-100 transition-all whitespace-nowrap"
                                >
                                    <Image
                                        src="/settings.svg"
                                        alt="Manage budget"
                                        width={16}
                                        height={16}
                                        className="opacity-90"
                                    />
                                    <p className="hidden lg:inline">Manage Budget</p>
                                </button>
                            </div>
                        </div>

                        {/* Overspent Alert */}
                        {getOverspentCategories().length > 0 && (
                            <div 
                                className={`rounded-lg overflow-hidden transition-all duration-200 bg-reddy/10 text-reddy border-b-4 border-b-reddy mb-4 ${
                                    showOverspentAlert ? 'h-auto' : 'h-[56px] md:h-[64px]'
                                }`}
                                onClick={expandOverspent}
                            >
                                <div className="p-3 md:p-4 flex justify-between items-center">
                                    <div>
                                        <p className="font-medium">
                                            <span className="text-base md:text-lg inline">{formatCurrency(getTotalOverspent())}</span> overspent
                                        </p>
                                    </div>
                                    <button
                                        onClick={expandOverspent}
                                        className="px-3 md:px-4 py-1 rounded-full bg-reddy text-background text-sm font-medium hover:bg-reddy/90 transition-colors"
                                    >
                                        {showOverspentAlert ? 'Close' : 'Fix Now'}
                                    </button>
                                </div>
                                
                                <div 
                                    className={`px-3 md:px-4 pb-3 md:pb-4 transition-all duration-200 ${
                                        showOverspentAlert 
                                        ? 'opacity-100 transform translate-y-0' 
                                        : 'opacity-0 transform -translate-y-2 pointer-events-none'
                                    }`}
                                >
                                    <div className="bg-reddy/20 rounded-lg p-3 md:p-4 mb-3">
                                        <h4 className="font-medium mb-2">Overspent Categories:</h4>
                                        <div className="space-y-1 text-sm">
                                            {getOverspentCategories().map(cat => (
                                                <div key={cat.id} className="flex justify-between">
                                                    <span>{cat.name}</span>
                                                    <span className="font-medium">{formatCurrency(Math.abs(cat.available))} over</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-sm opacity-90">
                                        <p className=""><strong>To balance your budget:</strong> Move money from other categories into the overspent ones, or add more income to cover the overspending.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Balance Assignment Info */}
                        {balanceInfo && (
                            <div 
                                className={`rounded-lg overflow-hidden transition-all duration-200 ${
                                    Math.round(balanceInfo.budgetPool*100)/100 == Math.round(balanceInfo.assigned*100)/100 ? ('h-[0px] pb-0') : (balanceInfo.budgetPool > balanceInfo.assigned 
                                    ? 'bg-green/10 text-green border-b-4 border-b-green h-[56px] md:h-[64px] md:pb-4 mb-4' 
                                    : 'bg-reddy/10 text-reddy border-b-4 border-b-reddy h-[56px] md:h-[64px] md:pb-4 mb-4') 
                                } ${isMassAssigning ? 'h-[128px] md:h-[128px]' : ''}
                                `}
                            onClick={isMassAssigning ? ()=>{} : massAssign}>
                                <div className="p-3 md:p-4 flex justify-between items-center">
                                    <div>
                                        {balanceInfo.budgetPool > balanceInfo.assigned ? (
                                            <p className="font-medium">
                                                <span className="text-base md:text-lg inline">{formatCurrency(balanceInfo.budgetPool - balanceInfo.assigned)}</span> left to assign
                                            </p>
                                        ) : (
                                            <p className="font-medium">
                                                <span className="text-base md:text-lg inline">{formatCurrency(balanceInfo.assigned - balanceInfo.budgetPool)}</span> too much assigned
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={massAssign}
                                        className={`px-3 md:px-4 py-1 rounded-full ${balanceInfo.budgetPool > balanceInfo.assigned ? 'bg-green hover:bg-green-dark' : 'bg-reddy hover:bg-old-reddy'} text-background text-sm font-medium transition-colors`}
                                    >
                                        {isMassAssigning ? 'Apply Changes' : (balanceInfo.budgetPool > balanceInfo.assigned ? 'Assign' : 'Fix Now')}
                                    </button>
                                </div>
                                
                                <div 
                                    className={`px-3 md:px-4 pb-3 md:pb-4 transition-all duration-200 ${
                                        isMassAssigning 
                                        ? 'opacity-100 transform translate-y-0' 
                                        : 'opacity-0 transform -translate-y-2 pointer-events-none'
                                    }`}
                                >
                                     <div className="text-xs md:text-sm opacity-90 mb-1 -mt-1">
                                        <p className="">{balanceInfo.budgetPool > balanceInfo.assigned ? "If you have money left over, assign it into next month's budget! This allows you to plan ahead." : "If you have over-assigned your budget, take some money away from categories that don't need it."}</p>
                                    </div>
                                    <div className= "flex gap-2">
                                        <button
                                            className={`px-3 md:px-4 py-1 rounded-full text-sm transition-colors ${
                                                pendingAction === 'fill-goals' 
                                                ? 'bg-green text-background' 
                                                : 'bg-white/10 hover:bg-white/20'
                                            }`}
                                            onClick={() => setPendingAction(
                                                pendingAction === 'fill-goals' ? null : 'fill-goals'
                                            )}
                                        >
                                            Fill All
                                        </button>
                                        <button
                                            className={`px-3 md:px-4 py-1 rounded-full text-sm transition-colors ${
                                                pendingAction === 'clear' 
                                                ? 'bg-reddy text-background' 
                                                : 'bg-white/10 hover:bg-white/20'
                                            }`}
                                            onClick={() => setPendingAction(
                                                pendingAction === 'clear' ? null : 'clear'
                                            )}
                                        >
                                            Empty All
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green"></div>
                            </div>
                        ) : error ? (
                            <div className="bg-reddy/20 text-reddy p-4 rounded-lg">
                                {error}
                            </div>
                        ) : categories.length === 0 ? (
                            <div className="text-center text-white/60 mt-5 max-w-md mx-auto">
                                <Image
                                    src="/transactions.svg"
                                    alt="No budget categories"
                                    width={48}
                                    height={48}
                                    className="image-black opacity-40 mx-auto mb-4"
                                />
                                <h2 className="text-2xl font-semibold mb-2">Welcome to CashCat!</h2>
                                <div className="bg-white/[.03] rounded-lg p-6 mb-2 md:mb-8 md:mt-4 backdrop-blur-sm">
                                    <h3 className="text-lg font-medium text-green mb-4">Get Started in 4 Steps:</h3>
                                    <ul className="inline-block text-left list-disc list-inside space-y-3 text-base">
                                        <li className="opacity-90">Enter your bank account balances</li>
                                        <li className="opacity-90">Create your budget</li>
                                        <li className="opacity-90">Log your first transaction</li>
                                        <li className="opacity-90">View your stats</li>
                                    </ul>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                    <Link
                                        href="/docs"
                                        className="bg-green text-black px-6 py-3 rounded-lg hover:bg-green-dark transition-colors text-sm font-medium sm:order-none"
                                    >
                                        Learn the Basics First
                                    </Link>
                                    <button
                                        onClick={() => setShowAccountModal(true)}
                                        className="px-6 py-3 rounded-lg border border-white/20 hover:bg-white/[.05] transition-colors text-sm font-medium text-white/90"
                                    >
                                        Let's Create Your Budget!
                                    </button>
                                    
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-1 md:space-y-2">
                                {/* Monthly Summary */}
                                <div className="bg-white/[.03] rounded-lg py-1 md:py-3 md:p-4 mb-2">
                                    <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 text-sm">
                                        <div className="text-center">
                                            <div className="text-white/60 text-xs uppercase tracking-wide md:mb-1">Assigned</div>
                                            <div className="font-medium text-green">{formatCurrency(categories.reduce((sum, cat) => sum + cat.assigned, 0))}</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-white/60 text-xs uppercase tracking-wide md:mb-1">Spent</div>
                                            <div className="font-medium text-reddy">{formatCurrency(categories.reduce((sum, cat) => sum + cat.spent, 0))}</div>
                                        </div>
                                    </div>
                                </div>

                                {Object.entries(groupedCategories).map(([groupName, groupCategories]) => {
                                    const { totalAssigned, totalSpent, totalAvailable } = getGroupTotals(groupCategories);
                                    
                                    return (
                                        <div key={groupName} className="space-y-1">
                                            <button
                                                onClick={() => toggleGroup(groupName)}
                                                className={`w-full flex items-center justify-between p-2.5 md:p-3  rounded-lg transition-all
                                                    ${expandedGroups.has(groupName) ? "bg-green/[0.1] hover:bg-white/[.1]" : "bg-white/[.03] hover:bg-white/[.1]"}
                                                    `}
                                            >
                                                <div className="flex text-left flex-col md:flex-row">
                                                    <h3 className="text-base md:text-lg font-medium min-w-40">{groupName}</h3>
                                                    <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm opacity-70 ">
                                                        <span className="text-white/60">{groupCategories.length} categor{groupCategories.length === 1 ? 'y' : 'ies'}</span>
                                                        <span className={getGroupTotals(groupCategories).totalAvailable >= 0 ? 'text-green' : 'text-reddy'}>
                                                            {formatCurrency(getGroupTotals(groupCategories).totalAvailable)} {getGroupTotals(groupCategories).totalAvailable >= 0 ? 'available' : 'over'}
                                                        </span>
                                                        <span className="text-white/60">
                                                            {formatCurrency(getGroupTotals(groupCategories).totalSpent)} spent
                                                        </span>
                                                    </div>
                                                </div>
                                                <Image
                                                    src="/chevron-right.svg"
                                                    alt={expandedGroups.has(groupName) ? 'Collapse' : 'Expand'}
                                                    width={18}
                                                    height={18}
                                                    className={`opacity-70 transition-transform duration-100 ${
                                                        expandedGroups.has(groupName) ? 'rotate-90' : ''
                                                    }`}
                                                />
                                            </button>
                                            
                                            <div className={`transition-all duration-100 overflow-hidden ${
                                                expandedGroups.has(groupName) 
                                                    ? 'opacity-100 max-h-[5000px]' 
                                                    : 'opacity-0 max-h-0'
                                            }`}>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3">
                                                    {groupCategories.map((category) => (
                                                        <div key={category.id}
                                                            className="transform transition-all hover:scale-[1.01] hover:shadow-md"
                                                            style={{ 
                                                                animation: 'fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) backwards'
                                                            }}
                                                        >
                                                            <CategoryCard
                                                                name={category.name}
                                                                assigned={category.assigned}
                                                                rollover={category.rollover}
                                                                spent={category.spent}
                                                                goalAmount={category.goalAmount}
                                                                group={category.group}
                                                                showGroup={false}
                                                                forceFlipMassAssign={isMassAssigning}
                                                                wasMassAssigningSoShouldClose={wasMassAssigningSoShouldClose}
                                                                onAssignmentUpdate={(amount) => handleAssignmentUpdate(category.id, amount)}
                                                                available={category.available}
                                                                dailyLeft={category.dailyLeft}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Reminders and IOUs Section */}
                        {categories.length > 0 && !loading && (
                            <div className="mt-6 md:mt-8">
                                <div className="bg-white/[.03] rounded-lg p-4 md:p-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <h2 className="text-lg md:text-xl font-semibold">Notes & Reminders</h2>
                                        {reminderLoading && (
                                            <div className="flex items-center gap-2 text-sm text-white/60">
                                                <div className="w-3 h-3 border border-white/30 border-t-white/60 rounded-full animate-spin"></div>
                                                <span>Saving...</span>
                                            </div>
                                        )}
                                    </div>
                                    <textarea
                                        value={reminderText}
                                        onChange={(e) => handleReminderChange(e.target.value)}
                                        placeholder="Add reminders, IOUs, and general notes for this budget period..."
                                        className="w-full text-sm min-h-[120px] bg-white/[.05] border border-white/[.1] rounded-lg p-3 text-white placeholder-white/50 resize-vertical focus:outline-none focus:border-green/50 focus:bg-white/[.08] transition-all"
                                        rows={5}
                                    />
                                    <p className="text-xs text-white/50 mt-2">
                                        Changes are automatically saved as you type
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </main>

                <ManageBudgetModal
                  isOpen={showManageModal}
                  onClose={() => (fetchBudgetData(), setShowManageModal(false))}
                />

                <AccountModal
                    isOpen={showAccountModal}
                    onClose={() => setShowAccountModal(false)}
                    onAccountsUpdated={() => {
                        setShowAccountModal(false);
                        setShowManageModal(true);
                    }}
                />
            </div>
        </ProtectedRoute>
    );
}
