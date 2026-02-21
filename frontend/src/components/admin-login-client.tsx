"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, User, Loader2 } from "lucide-react";
import Cookies from "js-cookie";
import { toast } from "sonner";

export default function AdminLoginClient() {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);

        const formData = new FormData(e.currentTarget);
        const username = formData.get("username") as string;
        const password = formData.get("password") as string;

        const body = new URLSearchParams();
        body.append("username", username);
        body.append("password", password);

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: body.toString(),
            });

            if (!response.ok) {
                throw new Error("Invalid username or password");
            }

            const data = await response.json();
            Cookies.set("admin_token", data.access_token, { expires: 1 }); // 1 day
            toast.success("Login successful!");
            router.push("/admin/dashboard");
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to login";
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-background flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100/20 via-background to-blue-100/20 transition-colors duration-300">
            <Card className="w-full max-w-md border border-border shadow-2xl bg-card/90 backdrop-blur-lg">
                <CardHeader className="space-y-1 text-center">
                    <div className="mx-auto w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white mb-4 shadow-lg dark:shadow-none">
                        <Lock className="w-6 h-6" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Admin Login</CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Enter your credentials to manage events
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <div className="relative">
                                <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                                <Input id="username" name="username" placeholder="admin" required className="pl-10 border-border bg-background" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                                <Input id="password" name="password" type="password" required className="pl-10 border-border bg-background" />
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="pt-4 pb-8">
                        <Button className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-lg dark:shadow-none transition-all border-none"
                            disabled={loading}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            {loading ? "Logging in..." : "Login"}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
