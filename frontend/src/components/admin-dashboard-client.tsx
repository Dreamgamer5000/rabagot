"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Loader2, Calendar, Globe, LogOut, Copy, Check, RefreshCw, Link as LinkIcon, ExternalLink } from "lucide-react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface Event {
    _id: string;
    name: string;
    slug: string;
    date: string;
    created_at: string;
    drive_folder_url?: string;
    secret_code?: string;
    sync_status?: string;
    last_sync_at?: string;
}

interface EventStatusData {
    total: number;
    pending: number;
    processed: number;
    errors: number;
    total_faces: number;
    progress: number;
    sync_status: string;
}

const EventStatus = ({ eventId, apiUrl, syncStatus, lastSyncAt, onSyncComplete }: {
    eventId: string,
    apiUrl: string,
    syncStatus?: string,
    lastSyncAt?: string,
    onSyncComplete: () => void
}) => {
    const [status, setStatus] = useState<EventStatusData | null>(null);
    const pollRef = useRef<NodeJS.Timeout | null>(null);
    const wasSyncingRef = useRef(syncStatus === "syncing");

    useEffect(() => {
        const fetchStatus = async () => {
            const token = Cookies.get("admin_token");
            try {
                const res = await fetch(`${apiUrl}/photos/status/${eventId}`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setStatus(data);

                    // Stop polling if fully complete
                    const syncDone = data.sync_status === "completed" || data.sync_status === "idle";
                    const processingDone = data.progress === 100 && data.pending === 0;

                    if (syncDone && processingDone && pollRef.current) {
                        clearInterval(pollRef.current);
                        pollRef.current = null;

                        // If it was syncing and now it's done, tell parent to refresh once
                        if (wasSyncingRef.current) {
                            onSyncComplete();
                            wasSyncingRef.current = false;
                        }
                    }

                    if (data.sync_status === "syncing") {
                        wasSyncingRef.current = true;
                    }
                }
            } catch (error: unknown) {
                console.error("Status fetch error:", error);
            }
        };

        fetchStatus();
        pollRef.current = setInterval(fetchStatus, 5000);
        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };
    }, [eventId, apiUrl, syncStatus, lastSyncAt, onSyncComplete]);

    if (!status) return <div className="h-2 w-full bg-muted animate-pulse rounded-full mt-2" />;

    return (
        <div className="space-y-2 mt-3 text-foreground transition-colors">
            <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <span>Indexing Progress</span>
                <span className="flex items-center gap-1">
                    {status.sync_status === "syncing" && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                    {status.progress >= 100 && status.sync_status !== "syncing" ? "Fully Indexed" : `${Math.round(status.progress)}%`}
                </span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                    className={`h-full transition-all duration-500 rounded-full ${status.errors > 0 ? 'bg-amber-500' : 'bg-indigo-600 dark:bg-indigo-500'}`}
                    style={{ width: `${status.progress}%` }}
                />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border mt-2">
                <div className="text-left pt-1">
                    <p className="text-[10px] text-muted-foreground leading-none mb-1">Photos</p>
                    <p className="font-bold text-foreground text-[12px]">{status.processed}/{status.total}</p>
                </div>
                <div className="text-left border-l border-border pl-2 pt-1">
                    <p className="text-[10px] text-muted-foreground leading-none mb-1">Faces</p>
                    <p className="font-bold text-foreground text-[12px]">{status.total_faces}</p>
                </div>
                <div className="text-left border-l border-border pl-2 pt-1">
                    <p className="text-[10px] text-muted-foreground leading-none mb-1 text-left">Errors</p>
                    <p className={`font-bold text-[12px] ${status.errors > 0 ? 'text-red-500' : 'text-foreground'}`}>{status.errors}</p>
                </div>
            </div>
        </div>
    );
};

const CopyButton = ({ slug }: { slug: string }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        const url = `${window.location.origin}/event/${slug}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success("URL copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-9 w-9 p-0 text-foreground border border-border flex-shrink-0 "
        >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
    );
};

export default function AdminDashboardClient() {
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [syncing, setSyncing] = useState<Record<string, boolean>>({});
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [driveUrl, setDriveUrl] = useState("");

    const router = useRouter();
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

    const fetchEvents = useCallback(async () => {
        try {
            const token = Cookies.get("admin_token");
            const response = await fetch(`${API_URL}/events/`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setEvents(data);
            }
        } catch (error) {
            console.error("Fetch events error:", error);
            toast.error("Failed to load events");
        } finally {
            setLoading(false);
        }
    }, [API_URL]);

    useEffect(() => {
        const token = Cookies.get("admin_token");
        if (!token) {
            router.push("/admin/login");
            return;
        }
        fetchEvents();
    }, [router, fetchEvents]);

    // Poll for event list updates if any event is syncing
    useEffect(() => {
        const isAnySyncing = events.some(e => e.sync_status === "syncing");

        if (isAnySyncing) {
            const interval = setInterval(fetchEvents, 5000);
            return () => clearInterval(interval);
        }
    }, [events, fetchEvents]);

    const handleCreateEvent = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setCreating(true);
        const token = Cookies.get("admin_token");
        const formData = new FormData(e.currentTarget);

        const payload = {
            name: formData.get("name"),
            slug: formData.get("slug"),
            date: new Date(formData.get("date") as string).toISOString(),
            drive_folder_url: formData.get("drive_folder_url"),
            secret_code: formData.get("secret_code")
        };

        try {
            const response = await fetch(`${API_URL}/events/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                toast.success("Event created successfully");
                fetchEvents();
                (e.target as HTMLFormElement).reset();
            } else {
                const err = await response.json();
                toast.error(err.detail || "Failed to create event");
            }
        } catch (error) {
            console.error("Create event error:", error);
            toast.error("Network error");
        } finally {
            setCreating(false);
        }
    };

    const handleSyncPhotos = async (eventId: string) => {
        setSyncing(prev => ({ ...prev, [eventId]: true }));
        const token = Cookies.get("admin_token");

        try {
            const response = await fetch(`${API_URL}/photos/sync/${eventId}`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (response.ok) {
                toast.success("Started syncing photos from Google Drive");
                setTimeout(() => fetchEvents(), 2000)
                return;
            } else {
                toast.error("Sync failed to start");
            }
        } catch (error) {
            console.error("Sync error:", error);
            toast.error("Network error during sync");
        } finally {
            setTimeout(() => {
                setSyncing(prev => ({ ...prev, [eventId]: false }));
            }, 2000);
        }
    };

    const handleUpdateDriveUrl = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEventId || !driveUrl) return;

        const token = Cookies.get("admin_token");
        try {
            const response = await fetch(`${API_URL}/events/${selectedEventId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ drive_folder_url: driveUrl })
            });

            if (response.ok) {
                toast.success("Drive folder updated. You can now start sync.");
                setDriveUrl("");
                setSelectedEventId(null);
                fetchEvents();
            } else {
                toast.error("Failed to update Drive URL");
            }
        } catch (error) {
            console.error("Update error:", error);
            toast.error("Network error");
        }
    };

    const handleLogout = () => {
        Cookies.remove("admin_token");
        router.push("/admin/login");
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-6 transition-colors duration-300">
            <header className="max-w-6xl mx-auto flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground font-sans tracking-tight">Admin Dashboard</h1>
                    <p className="text-muted-foreground">Manage events and automated Drive sync</p>
                </div>
                <Button variant="outline" onClick={handleLogout} className="gap-2 border-border bg-card hover:bg-muted">
                    <LogOut className="w-4 h-4" />
                    Logout
                </Button>
            </header>

            <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-8">
                {/* Create Event */}
                <Card className="border-border shadow-xl bg-card/80 backdrop-blur-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Plus className="w-5 h-5 text-indigo-600" />
                            Create New Event
                        </CardTitle>
                        <CardDescription>Setup a new event and link a Drive folder</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreateEvent} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Event Name</Label>
                                    <Input id="name" name="name" placeholder="Wedding 2024" required className="bg-background border-border" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="slug">URL Slug</Label>
                                    <Input id="slug" name="slug" placeholder="wedding-2024" required className="bg-background border-border" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="date">Event Date</Label>
                                <Input id="date" name="date" type="date" required className="bg-background border-border" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="drive_folder_url">Google Drive Folder URL</Label>
                                <Input id="drive_folder_url" name="drive_folder_url" placeholder="https://drive.google.com/..." className="bg-background border-border" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="secret_code">Secret Event Code (Optional)</Label>
                                <Input id="secret_code" name="secret_code" placeholder="Leave empty for public access" className="bg-background border-border" />
                            </div>
                            <Button className="w-full bg-indigo-600 hover:bg-indigo-700 h-11 text-white border-none shadow-lg shadow-indigo-100 dark:shadow-none" disabled={creating}>
                                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                                Create Event
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* Automation Sync */}
                <Card className="border-border shadow-xl bg-card/80 backdrop-blur-lg overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-16 -mt-16 pointer-events-none opacity-50" />
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <RefreshCw className="w-5 h-5 text-indigo-600" />
                            Link Folders
                        </CardTitle>
                        <CardDescription>Update Drive URL for existing events to start indexing</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleUpdateDriveUrl} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Select Event</Label>
                                <select
                                    className="w-full h-10 px-3 rounded-md border border-border bg-background focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-foreground"
                                    onChange={(e) => setSelectedEventId(e.target.value)}
                                    value={selectedEventId || ""}
                                    required
                                >
                                    <option value="" disabled>Choose an event...</option>
                                    {events.map((event) => (
                                        <option key={event._id} value={event._id}>{event.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="driveUrl">New Google Drive Folder URL</Label>
                                <div className="relative">
                                    <Input
                                        id="driveUrl"
                                        value={driveUrl}
                                        onChange={(e) => setDriveUrl(e.target.value)}
                                        placeholder="Paste link here..."
                                        required
                                        className="pr-10 bg-background border-border"
                                    />
                                    <LinkIcon className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                                </div>
                            </div>
                            <Button className="w-full bg-foreground text-background hover:bg-foreground/90 h-11 border-none shadow-lg" disabled={!selectedEventId || !driveUrl}>
                                Update Folder Path
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>

            {/* Event List */}
            <div className="max-w-6xl mx-auto mt-12">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-foreground tracking-tight">Active Events</h2>
                    <div className="text-xs text-muted-foreground font-medium bg-card px-3 py-1 rounded-full border border-border shadow-sm">
                        {events.length} Events Total
                    </div>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {events.map((event) => (
                        <Card key={event._id} className="border-border shadow-md hover:shadow-xl transition-all duration-300 bg-card group overflow-hidden">
                            <CardContent className="p-5 space-y-4">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <h4 className="font-bold text-foreground group-hover:text-indigo-600 transition-colors uppercase tracking-tight text-sm">{event.name}</h4>
                                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </div>
                                    </div>
                                    <div className={`p-2 rounded-lg ${event.drive_folder_url ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-muted text-muted-foreground'}`}>
                                        <Globe className="w-4 h-4" />
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <EventStatus
                                        eventId={event._id}
                                        apiUrl={API_URL}
                                        syncStatus={event.sync_status}
                                        lastSyncAt={event.last_sync_at}
                                        onSyncComplete={fetchEvents}
                                    />
                                </div>

                                {event.drive_folder_url && (
                                    <div className="p-3 bg-muted/40 rounded-xl space-y-2">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Connected Folder</p>
                                        <a
                                            href={event.drive_folder_url}
                                            target="_blank"
                                            className="text-xs text-indigo-600 dark:text-indigo-400 truncate block hover:underline flex items-center gap-1 font-medium"
                                        >
                                            <ExternalLink className="w-3 h-3" />
                                            Visit Source Folder
                                        </a>
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                            <span>Last indexed:</span>
                                            <span className="font-bold">{event.last_sync_at ? new Date(event.last_sync_at).toLocaleTimeString() : 'Never'}</span>
                                        </div>
                                        {event.secret_code && (
                                            <div className="flex items-center justify-between text-[10px] text-indigo-600 font-bold border-t border-indigo-100 dark:border-indigo-900/30 pt-1 mt-1">
                                                <span>Secret Code:</span>
                                                <span>{event.secret_code}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <Button
                                        variant="default"
                                        size="sm"
                                        disabled={syncing[event._id] || !event.drive_folder_url || event.sync_status === "syncing"}
                                        onClick={() => handleSyncPhotos(event._id)}
                                        className="h-9 flex-1 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100 dark:shadow-none border-none"
                                    >
                                        {syncing[event._id] || event.sync_status === "syncing" ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <>
                                                <RefreshCw className="w-3.5 h-3.5 mr-2" />
                                                Sync Now
                                            </>
                                        )}
                                    </Button>
                                    <CopyButton slug={event.slug} />
                                    <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-border bg-card" asChild title="Public Page">
                                        <a href={`/event/${event.slug}`} target="_blank">
                                            <Globe className="w-4 h-4 text-muted-foreground" />
                                        </a>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
