"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Moon, Sun, Laptop, Lock, Home, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import Cookies from "js-cookie";

export function Navbar() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const pathname = usePathname();
    const isAdminToken = Cookies.get("admin_token");

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            setMounted(true);
        });
        return () => cancelAnimationFrame(frame);
    }, []);

    // Hide login button if logged in or already on admin dashboard
    const showLoginButton = !isAdminToken && pathname !== "/admin/login" && !pathname.startsWith("/admin/dashboard");

    if (!mounted) {
        return (
            <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-16 items-center justify-between px-4 max-w-6xl mx-auto">
                    <div className="flex gap-6 md:gap-10">
                        <span className="font-bold text-xl tracking-tight">PICSHARE<span className="text-indigo-600">.</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 border rounded-md animate-pulse bg-slate-100 dark:bg-slate-800" />
                        <div className="w-9 h-9 border rounded-md animate-pulse bg-slate-100 dark:bg-slate-800" />
                    </div>
                </div>
            </nav>
        );
    }

    return (
        <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-colors">
            <div className="container flex h-16 items-center justify-between px-4 max-w-6xl mx-auto">
                <div className="flex gap-6 md:gap-10">
                    <Link href="/" className="flex items-center space-x-2 group">
                        <Home className="w-5 h-5 text-indigo-600 group-hover:scale-110 transition-transform" />
                        <span className="font-bold text-xl tracking-tight group-hover:text-indigo-600 transition-colors">
                            PICSHARE<span className="text-indigo-600 group-hover:text-indigo-400">.</span>
                        </span>
                    </Link>
                </div>

                <div className="flex items-center gap-2 md:gap-4">
                    <Link href="/events">
                        <Button variant="ghost" className={`text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 text-sm font-medium gap-2 hidden sm:flex ${pathname === '/events' ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20' : ''}`}>
                            <Calendar className="w-4 h-4" />
                            Events
                        </Button>
                        <Button variant="ghost" size="icon" className={`h-9 w-9 rounded-full sm:hidden ${pathname === '/events' ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20' : ''}`} title="Browse Events">
                            <Calendar className="w-4 h-4" />
                        </Button>
                    </Link>
                    {isAdminToken && !pathname.startsWith("/admin/dashboard") && (
                        <Link href="/admin/dashboard">
                            <Button variant="ghost" className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-sm font-bold gap-2 hidden sm:flex">
                                <Laptop className="w-4 h-4" />
                                Dashboard
                            </Button>
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full sm:hidden text-indigo-600 dark:text-indigo-400" title="Admin Dashboard">
                                <Laptop className="w-4 h-4" />
                            </Button>
                        </Link>
                    )}

                    {showLoginButton && (
                        <Link href="/admin/login">
                            <Button variant="ghost" className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 text-sm font-medium gap-2 hidden sm:flex">
                                <Lock className="w-4 h-4" />
                                Admin Login
                            </Button>
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full sm:hidden" title="Admin Login">
                                <Lock className="w-4 h-4" />
                            </Button>
                        </Link>
                    )}

                    <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-full p-1 border border-slate-200 dark:border-slate-700 shadow-inner">
                        <button
                            onClick={() => setTheme("light")}
                            className={`p-1.5 rounded-full transition-all ${theme === 'light'
                                ? 'bg-white text-amber-500 shadow-sm'
                                : 'text-slate-400 dark:hover:text-slate-200 hover:text-slate-600 uppercase'}`}
                            title="Light Mode"
                        >
                            <Sun className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setTheme("dark")}
                            className={`p-1.5 rounded-full transition-all ${theme === 'dark'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'text-slate-400 dark:hover:text-slate-200 hover:text-slate-600'}`}
                            title="Dark Mode"
                        >
                            <Moon className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setTheme("system")}
                            className={`p-1.5 rounded-full transition-all ${theme === 'system'
                                ? 'bg-slate-500 text-white shadow-sm'
                                : 'text-slate-400 dark:hover:text-slate-200 hover:text-slate-600'}`}
                            title="System Default"
                        >
                            <Laptop className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
}
