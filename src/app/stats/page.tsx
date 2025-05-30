'use client';
import Image from "next/image";
import { useRef } from "react";
import MobileNav from "../components/mobileNav";
import Navbar from "../components/navbar";
import ProtectedRoute from "../components/protected-route";
import Sidebar from "../components/sidebar";



export default function Stats() {
    const overviewRef = useRef<HTMLDivElement>(null);

    const totalGoal = 0; // Example data
    const totalAssigned = 0;
    const totalSpent = 0;
    const totalRemaining = totalAssigned - totalSpent;

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-background font-[family-name:var(--font-suse)]">
                <Navbar />
                <Sidebar />
                <MobileNav />
                
                <main className="pt-16 pb-28 md:pb-6 md:pl-64 p-6 fade-in md:ml-9">
                    <div className="max-w-7xl mx-auto">
                        <div className="hidden md:flex items-center justify-between mb-8 md:mt-8">
                            <h1 className="text-2xl font-bold tracking-[-.01em]">Statistics</h1>
                        </div>

                        {/* Early Access Notice */}
                        <div className="mb-8 p-6 bg-white/[.03] rounded-lg border-l-4 border-l-green">
                            <div className="flex items-start gap-4">
                                <div className="p-2 rounded-full bg-green/10">
                                    <Image
                                        src="/stats.svg"
                                        alt="Statistics"
                                        width={24}
                                        height={24}
                                        className="opacity-70"
                                    />
                                </div>
                                <div>
                                    <h2 className="text-lg font-medium mb-1">Statistics Coming Soon</h2>
                                    <p className="text-white/70">
                                        We're working hard to bring you detailed insights about your spending habits. Check back soon for charts, trends, and analytics!
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Summary Category */}
                        <div 
                            ref={overviewRef}
                            className={`relative mb-8 transform transition-all duration-300 hover:scale-[1.01] hover:shadow-md`}
                        >
                            <div className="p-4 bg-white/[.02] rounded-lg border-b-4 hidden">
                                <div className="flex flex-col md:flex-row justify-between mb-4">
                                    <h3 className="text-lg font-bold mb-2 md:mb-0">Monthly Overview</h3>
                                    <div className={`flex-1 transition-all duration-300 h-auto opacity-100`}>
                                        <div className="flex gap-4 flex-wrap justify-end">
                                            <div className="flex flex-col">
                                                <span className="text-sm text-white/50">Total Goals</span>
                                                <span className="font-medium">£{totalGoal.toFixed(2)}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm text-white/50">Assigned</span>
                                                <span className="font-medium text-green">£{totalAssigned.toFixed(2)}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm text-white/50">Spent so far</span>
                                                <span className="font-medium text-reddy">£{totalSpent.toFixed(2)}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm text-white/50">Left</span>
                                                <span className="font-medium text-green">£{totalRemaining.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className={`transition-all duration-300 h-auto opacity-100`}>
                                    <div className="relative">
                                        <div className="rounded h-4 bg-green-dark/20 w-full">
                                            <div 
                                                className="rounded h-full bg-green transition-all duration-500 ease-out absolute top-0 left-0"
                                                style={{width: `${(totalAssigned / totalGoal) * 100}%`}}
                                            />
                                            <div 
                                                className="rounded h-full transition-all duration-500 ease-out absolute top-0 left-0 bg-gray-500/100"
                                                style={{
                                                    width: `${(totalSpent / totalGoal) * 100}%`,
                                                    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.1) 5px, rgba(255,255,255,0.1) 10px)'
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-between mt-2 text-sm">
                                        <span className="text-white/50">{((totalAssigned / totalGoal) * 100).toFixed(1)}% Assigned</span>
                                        <span className="text-reddy">{((totalSpent / totalGoal) * 100).toFixed(1)}% Spent</span>
                                    </div>
                                </div>
                            </div>
                            
                        </div>
                    </div>
                </main>
            </div>
        </ProtectedRoute>
    );
}
