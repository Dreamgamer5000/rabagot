"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Calendar, Lock, ArrowRight, Search, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";

interface PublicEvent {
    _id: string;
    name: string;
    slug: string;
    date: string;
    is_protected: boolean;
}

export default function EventsListClient() {
    const [events, setEvents] = useState<PublicEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [verifying, setVerifying] = useState<string | null>(null);
    const [secretCode, setSecretCode] = useState("");

    const router = useRouter();
    const API_URL = process.env.NEXT_PUBLIC_API_URL

    useEffect(() => {
        const fetchEvents = async () => {
            console.log(`Fetching events from: ${API_URL}/events/public/list`);
            try {
                const res = await fetch(`${API_URL}/events/public/list`);
                if (res.ok) {
                    const data = await res.json();
                    setEvents(data);
                }
            } catch (err: unknown) {
                console.error("Failed to fetch events:", err);
                toast.error("Could not load events");
            } finally {
                setLoading(false);
            }
        };
        fetchEvents();
    }, [API_URL]);

    const handleJoin = async (event: PublicEvent) => {
        if (!event.is_protected) {
            router.push(`/event/${event.slug}`);
            return;
        }

        // If protected, toggle the code input for this event
        if (verifying === event._id) {
            // If already verifying, try to submit
            submitCode(event);
        } else {
            setVerifying(event._id);
            setSecretCode("");
        }
    };

    const submitCode = async (event: PublicEvent) => {
        if (!secretCode) {
            toast.error("Please enter the secret code");
            return;
        }

        try {
            const res = await fetch(`${API_URL}/events/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slug: event.slug, code: secretCode })
            });

            if (res.ok) {
                // Store code in session storage for the upload page to pick up
                sessionStorage.setItem(`event_code_${event.slug}`, secretCode);
                trackEvent("event_passcode_verified", { slug: event.slug });
                toast.success("Code verified! Redirecting...");
                router.push(`/event/${event.slug}`);
            } else {
                toast.error("Invalid secret code");
            }
        } catch (err: unknown) {
            console.error("Verification error:", err);
            toast.error("Verification failed");
        }
    };

    const filteredEvents = events.filter(e =>
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.slug.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="bg-background py-12 px-4 transition-colors duration-500">
            <div className="max-w-6xl mx-auto space-y-12">
                {/* Header Section */}
                <div className="text-center space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-sm font-bold border border-indigo-100 dark:border-indigo-900/30 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <PartyPopper className="w-4 h-4" />
                        <span>Find Your Memories</span>
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black tracking-tight text-foreground transition-all duration-700">
                        Active <span className="text-indigo-600 decoration-wavy decoration-indigo-200">Events</span>
                    </h1>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto font-medium">
                        Select an event below to find your photos. You&apos;ll need to take a quick selfie to help us identify you.
                    </p>
                </div>

                {/* Search Bar */}
                <div className="max-w-xl mx-auto relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-indigo-600 transition-colors" />
                    <Input
                        placeholder="Search for an event (e.g. 'Wedding')"
                        className="pl-12 h-14 rounded-2xl border-border bg-card shadow-lg focus-visible:ring-indigo-600 transition-all text-lg"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Events Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {filteredEvents.length > 0 ? (
                        filteredEvents.map((event, idx) => (
                            <Card
                                key={event._id}
                                className="group border-none shadow-xl bg-card hover:shadow-2xl transition-all duration-500 overflow-hidden relative animate-in fade-in slide-in-from-bottom-4"
                                style={{ animationDelay: `${idx * 100}ms` }}
                            >
                                <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600/10 group-hover:bg-indigo-600 transition-colors" />

                                <CardHeader className="space-y-4">
                                    <div className="flex justify-between items-start">
                                        <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400">
                                            <Calendar className="w-6 h-6" />
                                        </div>
                                        {event.is_protected && (
                                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-500 text-[10px] font-black uppercase tracking-widest border border-amber-100 dark:border-amber-900/20">
                                                <Lock className="w-3 h-3" />
                                                Protected
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <CardTitle className="text-2xl font-bold text-foreground group-hover:text-indigo-600 transition-colors leading-tight">
                                            {event.name}
                                        </CardTitle>
                                        <CardDescription className="font-medium text-muted-foreground mt-1">
                                            {new Date(event.date).toLocaleDateString(undefined, {
                                                weekday: 'long',
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            })}
                                        </CardDescription>
                                    </div>
                                </CardHeader>

                                <CardContent className="space-y-4">
                                    {verifying === event._id ? (
                                        <div className="space-y-2 animate-in zoom-in-95 duration-200">
                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Enter Event Code</label>
                                            <Input
                                                autoFocus
                                                placeholder="••••••"
                                                className="h-12 text-center text-xl font-black tracking-[0.5em] bg-muted/50 border-indigo-200 focus:border-indigo-600"
                                                value={secretCode}
                                                onChange={(e) => setSecretCode(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && submitCode(event)}
                                            />
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            Join this event to access your personal gallery of photos.
                                        </p>
                                    )}
                                </CardContent>

                                <CardFooter>
                                    <Button
                                        className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-lg shadow-indigo-100 dark:shadow-none border-none group/btn"
                                        onClick={() => handleJoin(event)}
                                    >
                                        {verifying === event._id ? "Verify Code" : "Join Event"}
                                        <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                                    </Button>
                                    {verifying === event._id && (
                                        <button
                                            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1"
                                            onClick={(e) => { e.stopPropagation(); setVerifying(null); }}
                                        >
                                            <span className="sr-only">Cancel</span>
                                            <Lock className="w-4 h-4" />
                                        </button>
                                    )}
                                </CardFooter>
                            </Card>
                        ))
                    ) : (
                        <div className="col-span-full py-20 text-center space-y-4 bg-muted/20 rounded-3xl border-2 border-dashed border-border">
                            <div className="mx-auto w-20 h-20 bg-card rounded-full flex items-center justify-center text-muted-foreground">
                                <Search className="w-10 h-10" />
                            </div>
                            <h3 className="text-xl font-bold text-foreground">No events found</h3>
                            <p className="text-muted-foreground">Try adjusting your search or check back later.</p>
                            <Button variant="outline" onClick={() => setSearchQuery("")}>Clear Search</Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
