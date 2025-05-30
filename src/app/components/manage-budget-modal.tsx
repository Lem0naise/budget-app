'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { Category, Group } from '../types/budget';

type ManageBudgetModalProps = {
    isOpen: boolean;
    onClose: () => void;
};

export default function ManageBudgetModal({ isOpen, onClose }: ManageBudgetModalProps) {
    const supabase = createClientComponentClient();
    const [activeTab, setActiveTab] = useState<'categories'|'starting'|'settings'>('categories');
    const [groups, setGroups] = useState<Group[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [startingBalance, setStartingBalance] = useState('');
    const [startingBalanceId, setStartingBalanceId] = useState<string | null>(null);
    const [isInitialSetup, setIsInitialSetup] = useState(true);
    const [hideBudgetValues, setHideBudgetValues] = useState(false);
    
    // Form states
    const [editingGroup, setEditingGroup] = useState<Group | null>(null);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [newGroupName, setNewGroupName] = useState('');
    const [newCategoryData, setNewCategoryData] = useState({
        name: '',
        group: '',
        goal: '',
        timeframe: 'monthly' as const
    });
    const [isClosing, setIsClosing] = useState(false);
    const [showAddGroup, setShowAddGroup] = useState(false);
    const [showAddCategory, setShowAddCategory] = useState(false);


    useEffect(() => {
        if (!startingBalance) {
            setActiveTab('starting');
        }
        else {
            setActiveTab('categories');
        }
    }, [startingBalanceId])

    // Load settings from localStorage on component mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedHideBudgetValues = localStorage.getItem('hideBudgetValues') === 'true';
            setHideBudgetValues(savedHideBudgetValues);
        }
    }, []);

    // Save hide budget values setting to localStorage and update global state
    const toggleHideBudgetValues = () => {
        const newValue = !hideBudgetValues;
        setHideBudgetValues(newValue);
        
        if (typeof window !== 'undefined') {
            localStorage.setItem('hideBudgetValues', newValue.toString());
            // Dispatch custom event to notify other components
            window.dispatchEvent(new CustomEvent('hideBudgetValuesChanged', { 
                detail: { hideBudgetValues: newValue } 
            }));
        }
    };

    // Fetch data functions
    const fetchGroups = async () => {
        try {
            const { data, error } = await supabase
                .from('groups')
                .select('*')
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            setGroups(data || []);
        } catch (error) {
            console.error('Error fetching groups:', error);
            setError('Failed to load groups');
        }
    };

    const fetchCategories = async () => {
        try {
            const { data, error } = await supabase
                .from('categories')
                .select(`
                    *,
                    groups (
                        id,
                        name
                    )
                `)
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            setCategories(data || []);
        } catch (error) {
            console.error('Error fetching categories:', error);
            setError('Failed to load categories');
        }
    };

    const fetchStartingBalance = async () => {
        try {
            const {data: {user}, error: userError} = await supabase.auth.getUser();
            if (userError || !user) throw new Error('Not authenticated');

            const {data, error} = await supabase
                .from('transactions')
                .select('id, amount')
                .eq('user_id', user.id)
                .eq('type', 'starting')
                .single();

            if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows returned"

            if (data) {
                setStartingBalance(Math.abs(data.amount).toFixed(2));
                setStartingBalanceId(data.id);
                setIsInitialSetup(false);
            } else {
                setStartingBalance('');
                setStartingBalanceId(null);
                setIsInitialSetup(true);
            }
        } catch (error) {
            console.error('Error fetching starting balance:', error);
            setError('Failed to load starting balance');
        }
    };

    // Group CRUD operations
    const createGroup = async (name: string) => {
        try {
            const { error } = await supabase
                .from('groups')
                .insert({ name });
            
            if (error) throw error;
            
            await fetchGroups();
            setNewGroupName('');
        } catch (error) {
            console.error('Error creating group:', error);
            setError('Failed to create group');
        }
    };

    const updateGroup = async (id: string, name: string) => {
        try {
            const { error } = await supabase
                .from('groups')
                .update({ name })
                .eq('id', id);
            
            if (error) throw error;
            
            await fetchGroups();
            setEditingGroup(null);
        } catch (error) {
            console.error('Error updating group:', error);
            setError('Failed to update group');
        }
    };

    const deleteGroup = async (id: string) => {
        try {
            const { error } = await supabase
                .from('groups')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            
            await fetchGroups();
            await fetchCategories(); // Refresh categories as they might be affected
        } catch (error) {
            console.error('Error deleting group:', error);
            setError('Make sure you delete or reassign all categories in this group before deleting it.');
        }
    };

    // Category CRUD operations
    const createCategory = async (categoryData: typeof newCategoryData) => {
        try {
            if (!categoryData.group) {
                throw new Error('Group is required');
            }
            
            const { error } = await supabase
                .from('categories')
                .insert({
                    name: categoryData.name,
                    group: categoryData.group,
                    goal: categoryData.goal ? parseFloat(categoryData.goal) : null,
                    timeframe: { type: categoryData.timeframe }
                });
            
            if (error) throw error;
            
            await fetchCategories();
            setNewCategoryData({
                name: '',
                group: '',
                goal: '',
                timeframe: 'monthly'
            });
        } catch (error) {
            console.error('Error creating category:', error);
            setError('Failed to create category');
        }
    };

    const updateCategory = async (id: string, categoryData: Partial<Category>) => {
        try {
            const { error } = await supabase
                .from('categories')
                .update(categoryData)
                .eq('id', id);
            
            if (error) throw error;
            
            await fetchCategories();
            setEditingCategory(null);
        } catch (error) {
            console.error('Error updating category:', error);
            setError('Failed to update category');
        }
    };

    const deleteCategory = async (id: string) => {
        try {
            const { error } = await supabase
                .from('categories')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            
            await fetchCategories();
        } catch (error) {
            console.error('Error deleting category:', error);
            setError('Failed to delete category - make sure all transactions in this category are reassigned!');
        }
    };

    // Function to save or update starting balance
    const saveStartingBalance = async () => {
        try {
            const {data: {user}, error: userError} = await supabase.auth.getUser();
            if (userError || !user) throw new Error('Not authenticated');

            const parsedBalance = parseFloat(startingBalance);
            if (isNaN(parsedBalance)) throw new Error('Invalid amount');

            const transactionData = {
                amount: parsedBalance,
                type: 'starting',
                date: new Date().toISOString().split('T')[0],
                vendor: 'Starting Balance',
                created_at: new Date().toISOString(),
            };

            let error;
            if (startingBalanceId) {
                // Update existing starting balance
                const response = await supabase
                    .from('transactions')
                    .update({ ...transactionData, user_id: user.id })
                    .eq('id', startingBalanceId);
                error = response.error;
            } else {
                // Create new starting balance
                const response = await supabase
                    .from('transactions')
                    .insert({ ...transactionData, user_id: user.id });
                error = response.error;
            }

            if (error) throw error;

            await fetchStartingBalance();
            setError(null);
        } catch (error) {
            console.error('Error saving starting balance:', error);
            setError('Failed to save starting balance');
        }
    };

    // Initial data fetch
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflowY = 'hidden';
        } else {
            document.body.style.overflowY = 'unset';
        }
        return () => {
            document.body.style.overflowY = 'unset';
        };
    }, [isOpen]);

    // Existing useEffect for data fetching
    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            Promise.all([fetchGroups(), fetchCategories(), fetchStartingBalance()])
                .finally(() => setLoading(false));
        }
    }, [isOpen]);

    useEffect(() => {
        setError("");
    }, [activeTab]); // clear error if active tab

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            setIsClosing(false);
            onClose();
            // Reset all form states
            setEditingGroup(null);
            setEditingCategory(null);
            setNewGroupName('');
            setNewCategoryData({
                name: '',
                group: '',
                goal: '',
                timeframe: 'monthly'
            });
            setShowAddGroup(false);
            setShowAddCategory(false);
        }, 200);
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            handleClose();
        }
    };

    // Check if there are any categories or transactions to determine if this is initial setup
    const checkIsInitialSetup = async () => {
        try {
            const {data: {user}} = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const [categoriesResponse, transactionsResponse] = await Promise.all([
                supabase
                    .from('categories')
                    .select('id')
                    .eq('user_id', user.id)
                    .limit(1),
                supabase
                    .from('transactions')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('type', 'starting')
                    .limit(1)
            ]);

            if (categoriesResponse.error) throw categoriesResponse.error;
            if (transactionsResponse.error) throw transactionsResponse.error;

            setIsInitialSetup(!categoriesResponse.data?.length && !transactionsResponse.data?.length);
        } catch (error) {
            console.error('Error checking setup status:', error);
        }
    };

    if (!isOpen) return null;

    return (
        <div 
            className={`fixed inset-0 bg-black md:bg-black/70 backdrop-blur-sm z-[100] flex items-start md:items-center justify-center font-[family-name:var(--font-suse)] overflow-hidden ${
                isClosing ? 'animate-[fadeOut_0.2s_ease-out]' : 'animate-[fadeIn_0.2s_ease-out]'
            }`}
            onClick={handleBackdropClick}
        >
            <div 
                className={`relative bg-white/[.09] md:rounded-lg md:border-b-4 w-full md:max-w-xl h-screen md:h-auto md:max-h-[90vh] flex flex-col ${
                    isClosing ? 'animate-[slideOut_0.2s_ease-out]' : 'animate-[slideIn_0.2s_ease-out]'
                }`}
            >
                {/* Header Section */}
                <div className="flex-none p-6 border-b border-white/[.1]">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold">Manage Budget</h2>
                        <button 
                            onClick={handleClose}
                            className="p-2 hover:bg-white/[.05] rounded-full transition-colors text-white"
                        >
                            <Image
                                src="/minus.svg"
                                alt="Close"
                                width={16}
                                height={16}
                                className="opacity-100 invert"
                            />
                        </button>
                    </div>

                    <div className="flex gap-4 mt-6">
                        <button 
                            onClick={() => setActiveTab('categories')}
                            className={`px-4 py-2 transition-all duration-200 ${
                                activeTab === 'categories'
                                ? 'text-green border-b-2 border-green' 
                                : 'text-white/60 hover:text-white'
                            }`}
                        >
                            Categories & Groups
                        </button>
                        <button 
                            onClick={() => setActiveTab('settings')}
                            className={`px-4 py-2 transition-all duration-200 ${
                                activeTab === 'settings' 
                                ? 'text-green border-b-2 border-green' 
                                : 'text-white/60 hover:text-white'
                            }`}
                        >
                            Other Settings
                        </button>
                         <button 
                            onClick={() => setActiveTab('starting')}
                            className={`px-4 py-2 transition-all duration-200 ${
                                activeTab === 'starting' 
                                ? 'text-green border-b-2 border-green' 
                                : 'text-white/60 hover:text-white'
                            }`}
                        >
                            Starting Balance
                        </button>
                        
                    </div>
                </div>

                {/* Scrollable Content Section */}
                <div className="flex-1 overflow-y-auto p-6 pb-30">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green"></div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {error && (
                                <div className="bg-reddy/20 text-reddy p-3 rounded-lg text-sm mb-4">
                                    {error}
                                </div>
                            )}
                            
                            
                            {activeTab === 'starting' ? (
                                <div className="bg-white/[.03] rounded-lg p-6 mb-8">
                                    <h3 className="text-lg font-medium text-green mb-4">Starting Balance</h3>
                                    <p className="text-sm text-white/70 mb-6">
                                        {startingBalanceId 
                                            ? "Update your starting balance if you need to correct it."
                                            : "Set your starting balance to begin tracking your finances."}
                                    </p>
                                    <form onSubmit={(e) => {
                                        e.preventDefault();
                                        saveStartingBalance();
                                    }} className="space-y-4">
                                        <div>
                                            <label className="block text-sm text-white/50 mb-1">Balance Amount</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">£</span>
                                                <input
                                                    type="tel"
                                                    inputMode="decimal"
                                                    pattern="[0-9]*\.?[0-9]*"
                                                    value={startingBalance}
                                                    onChange={(e) => setStartingBalance(e.target.value)}
                                                    required
                                                    placeholder="0.00"
                                                    className="w-full p-2 pl-7 rounded-lg bg-white/[.05] border border-white/[.15] focus:border-green focus:outline-none transition-colors text-sm"
                                                />
                                            </div>
                                        </div>
                                        <button
                                            type="submit"
                                            className="w-full bg-green text-black px-4 py-2 rounded-lg hover:bg-green-dark transition-colors text-sm font-medium"
                                        >
                                            {startingBalanceId ? "Update Balance" : "Save Balance"}
                                        </button>
                                    </form>
                                </div>
                            ) : activeTab === 'settings' ? (
                                <div className="space-y-6">
                                    <div className="bg-white/[.03] rounded-lg p-6">
                                        <h3 className="text-lg font-medium text-green mb-4">Display</h3>
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between p-4 bg-white/[.03] rounded-lg">
                                                <div>
                                                    <h4 className="font-medium text-white">Hide Budget Values</h4>
                                                    <p className="text-sm text-white/60 mt-1">
                                                        Replace all monetary values with asterisks for screen sharing
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={toggleHideBudgetValues}
                                                    className={`relative min-w-10 h-6 rounded-full transition-colors duration-200 ${
                                                        hideBudgetValues ? 'bg-green' : 'bg-white/20'
                                                    }`}
                                                >
                                                    <div
                                                        className={`absolute w-5 h-5 bg-white rounded-full transition-transform duration-200 top-0.5 ${
                                                            hideBudgetValues ? 'translate-x-5' : 'translate-x-0.5'
                                                        }`}
                                                    />
                                                </button>
                                            </div>
                                            <div className="flex  justify-between p-4 bg-white/[.03] rounded-lg flex-col">
                                                <p className="block font-medium text-white mb-2">Currency</p>
                                                <select
                                                    className="w-full p-2 rounded-lg bg-white/[.05] border border-white/[.15] focus:border-green focus:outline-none transition-colors text-sm disabled:opacity-50"
                                                    disabled
                                                >
                                                    <option value="GBP">£ GBP (Coming Soon)</option>
                                                    <option value="USD">$ USD (Coming Soon)</option>
                                                    <option value="EUR">€ EUR (Coming Soon)</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                     {/* Budget Settings */}
                                    <div className="bg-white/[.03] rounded-lg p-6">
                                         <h3 className="text-lg font-medium text-green mb-4">Import</h3>
                                        <div className="flex flex-col gap-4">
                                            <div className="flex text-left justify-between p-4 bg-white/[.03] rounded-lg flex-col">
                                                <p className="block font-medium text-white mb-2">Import Transactions</p>
                                                <button
                                                    className="w-full px-4 py-2 bg-white/[.05] hover:bg-white/[.08] rounded-lg transition-all text-white/70 hover:text-white disabled:opacity-50 disabled:hover:bg-white/[.05] disabled:hover:text-white/70"
                                                    disabled
                                                >
                                                    Import from CSV (Coming Soon)
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Add new group form */}
                                    <div className="bg-white/[.03] rounded-lg overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={() => setShowAddGroup(!showAddGroup)}
                                            className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[.02] transition-colors"
                                        >
                                            <h3 className="text-lg font-medium text-green">Add New Group</h3>
                                            <Image
                                                src={showAddGroup ? "/minus.svg" : "/plus.svg"}
                                                alt={showAddGroup ? "Collapse" : "Expand"}
                                                width={16}
                                                height={16}
                                                className="opacity-70 invert transition-transform duration-200"
                                            />
                                        </button>
                                        {showAddGroup && (
                                            <div className="px-4 pb-4 border-t border-white/[.05]">
                                                <form onSubmit={(e) => {
                                                    e.preventDefault();
                                                    createGroup(newGroupName);
                                                    setShowAddGroup(false);
                                                }} className="space-y-4 mt-4">
                                                    <div>
                                                        <label className="block text-sm text-white/50 mb-1">Group Name</label>
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={newGroupName}
                                                                onChange={(e) => setNewGroupName(e.target.value)}
                                                                placeholder="Enter group name"
                                                                className="flex-1 p-2 rounded-lg bg-white/[.05] border border-white/[.15] focus:border-green focus:outline-none transition-colors text-sm"
                                                                autoFocus={showAddGroup}
                                                            />
                                                            <button
                                                                type="submit"
                                                                disabled={!newGroupName.trim()}
                                                                className="bg-green text-black px-4 py-2 rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                                            >
                                                                Add Group
                                                            </button>
                                                        </div>
                                                    </div>
                                                </form>
                                            </div>
                                        )}
                                    </div>

                                    {/* Add new category form */}
                                    <div className="bg-white/[.03] rounded-lg overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={() => setShowAddCategory(!showAddCategory)}
                                            className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[.02] transition-colors"
                                        >
                                            <h3 className="text-lg font-medium text-green">Add New Category</h3>
                                            <Image
                                                src={showAddCategory ? "/minus.svg" : "/plus.svg"}
                                                alt={showAddCategory ? "Collapse" : "Expand"}
                                                width={16}
                                                height={16}
                                                className="opacity-70 invert transition-transform duration-200"
                                            />
                                        </button>
                                        {showAddCategory && (
                                            <div className="px-4 pb-4 border-t border-white/[.05]">
                                                <form onSubmit={(e) => {
                                                    e.preventDefault();
                                                    createCategory(newCategoryData);
                                                    setShowAddCategory(false);
                                                }} className="space-y-4 mt-4">
                                                    <div>
                                                        <label className="block text-sm text-white/50 mb-1">Category Name</label>
                                                        <input
                                                            type="text"
                                                            value={newCategoryData.name}
                                                            onChange={(e) => setNewCategoryData({...newCategoryData, name: e.target.value})}
                                                            placeholder="Enter category name"
                                                            className="w-full p-2 rounded-lg bg-white/[.05] border border-white/[.15] focus:border-green focus:outline-none transition-colors text-sm"
                                                            autoFocus={showAddCategory}
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm text-white/50 mb-1">Group</label>
                                                        <select
                                                            value={newCategoryData.group}
                                                            onChange={(e) => setNewCategoryData({...newCategoryData, group: e.target.value})}
                                                            className="w-full p-2 rounded-lg bg-white/[.05] border border-white/[.15] focus:border-green focus:outline-none transition-colors text-sm"
                                                            required
                                                        >
                                                            <option value="" disabled>Select a Group</option>
                                                            {groups.map((group) => (
                                                                <option key={group.id} value={group.id}>{group.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm text-white/50 mb-1">Monthly Goal (Optional)</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">£</span>
                                                            <input
                                                                type="number"
                                                                value={newCategoryData.goal}
                                                                onChange={(e) => setNewCategoryData({...newCategoryData, goal: e.target.value})}
                                                                placeholder="0.00"
                                                                step="0.01"
                                                                className="w-full p-2 pl-7 rounded-lg bg-white/[.05] border border-white/[.15] focus:border-green focus:outline-none transition-colors text-sm"
                                                            />
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="submit"
                                                        disabled={!newCategoryData.name.trim() || !newCategoryData.group}
                                                        className="w-full bg-green text-black px-4 py-2 rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                                    >
                                                        Add Category
                                                    </button>
                                                </form>
                                            </div>
                                        )}
                                    </div>

                                    {/* Groups and their categories */}
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-medium text-white/80">Your Groups & Categories</h3>
                                        {groups.map(group => {
                                            const groupCategories = categories.filter(cat => cat.group === group.id);
                                            
                                            return (
                                                <div key={group.id} className="bg-white/[.03] rounded-lg p-4">
                                                    {/* Group header */}
                                                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/[.1]">
                                                        {editingGroup?.id === group.id ? (
                                                            <div className="flex items-center gap-2 flex-1">
                                                                <input
                                                                    type="text"
                                                                    value={editingGroup.name}
                                                                    onChange={(e) => setEditingGroup({...editingGroup, name: e.target.value})}
                                                                    className="flex-1 p-2 rounded-lg bg-white/[.05] border border-white/[.15] focus:border-green focus:outline-none transition-colors text-sm"
                                                                    
                                                                />
                                                                <button
                                                                    onClick={() => updateGroup(group.id, editingGroup.name)}
                                                                    className="px-3 py-1 rounded-lg bg-green/20 hover:bg-green/30 text-green transition-colors text-sm"
                                                                >
                                                                    Save
                                                                </button>
                                                                <button
                                                                    onClick={() => setEditingGroup(null)}
                                                                    className="px-3 py-1 rounded-lg hover:bg-white/[.05] transition-colors text-sm"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div>
                                                                    <h4 className="font-medium text-lg text-green">{group.name}</h4>
                                                                    <p className="text-sm text-white/50">{groupCategories.length} categories</p>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => setEditingGroup(group)}
                                                                        className="p-2 rounded-lg hover:bg-white/[.05] transition-colors text-sm"
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                    <button
                                                                        onClick={() => deleteGroup(group.id)}
                                                                        className="p-2 rounded-lg hover:bg-reddy/20 transition-colors text-reddy text-sm"
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* Categories in this group */}
                                                    <div className="space-y-2">
                                                        {groupCategories.length === 0 ? (
                                                            <p className="text-white/40 text-sm italic">No categories in this group yet</p>
                                                        ) : (
                                                            groupCategories.map((category) => (
                                                                <div key={category.id} className="p-3 rounded-lg bg-white/[.05] group border-l-2 border-green/30">
                                                                    {editingCategory?.id === category.id ? (
                                                                        <form onSubmit={(e) => {
                                                                            e.preventDefault();
                                                                            if (!editingCategory.group) return;
                                                                            updateCategory(category.id, {
                                                                                name: editingCategory.name,
                                                                                group: editingCategory.group,
                                                                                goal: editingCategory.goal
                                                                            });
                                                                        }} className="space-y-3">
                                                                            <div className="flex gap-4">
                                                                                <div className="flex-1">
                                                                                    <input
                                                                                        type="text"
                                                                                        value={editingCategory.name}
                                                                                        onChange={(e) => setEditingCategory({...editingCategory, name: e.target.value})}
                                                                                        className="w-full p-2 rounded-lg bg-white/[.05] border border-white/[.15] focus:border-green focus:outline-none transition-colors text-sm"
                                                                                        
                                                                                    />
                                                                                </div>
                                                                                <select
                                                                                    value={editingCategory.group || ''}
                                                                                    onChange={(e) => setEditingCategory({...editingCategory, group: e.target.value})}
                                                                                    className="w-48 p-2 rounded-lg bg-white/[.05] border border-white/[.15] focus:border-green focus:outline-none transition-colors text-sm"
                                                                                    required
                                                                                >
                                                                                    {groups.map((g) => (
                                                                                        <option key={g.id} value={g.id}>{g.name}</option>
                                                                                    ))}
                                                                                </select>
                                                                            </div>
                                                                            <div className="flex gap-4">
                                                                                <div className="relative flex-1">
                                                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">£</span>
                                                                                    <input
                                                                                        type="number"
                                                                                        value={editingCategory.goal || ''}
                                                                                        onChange={(e) => setEditingCategory({...editingCategory, goal: parseFloat(e.target.value) || null})}
                                                                                        placeholder="Goal Amount"
                                                                                        step="0.01"
                                                                                        className="w-full p-2 pl-7 rounded-lg bg-white/[.05] border border-white/[.15] focus:border-green focus:outline-none transition-colors text-sm"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex justify-end gap-2">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setEditingCategory(null)}
                                                                                    className="px-3 py-1 rounded-lg hover:bg-white/[.05] transition-colors text-sm"
                                                                                >
                                                                                    Cancel
                                                                                </button>
                                                                                <button
                                                                                    type="submit"
                                                                                    disabled={!editingCategory.name.trim() || !editingCategory.group}
                                                                                    className="px-3 py-1 rounded-lg bg-green/20 hover:bg-green/30 text-green transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                                                >
                                                                                    Save Changes
                                                                                </button>
                                                                            </div>
                                                                        </form>
                                                                    ) : (
                                                                        <div className="flex items-center justify-between">
                                                                            <div>
                                                                                <span className="block font-medium">{category.name}</span>
                                                                                <span className="text-sm text-white/50">
                                                                                    Goal: £{category.goal || 0}
                                                                                </span>
                                                                            </div>
                                                                            
                                                                            <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                                                <button
                                                                                    onClick={() => setEditingCategory(category)}
                                                                                    className="p-2 rounded-lg hover:bg-white/[.05] transition-colors text-sm"
                                                                                >
                                                                                    Edit
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => deleteCategory(category.id)}
                                                                                    className="p-2 rounded-lg hover:bg-reddy/20 transition-colors text-reddy text-sm"
                                                                                >
                                                                                    Delete
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        
                                        {groups.length === 0 && (
                                            <p className="text-white/40 text-center py-8">No groups created yet. Add your first group above to get started.</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
