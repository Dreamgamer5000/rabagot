"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Loader2, Calendar, Globe, LogOut, Copy, Check, RefreshCw, Link as LinkIcon, ExternalLink, Users, X, Trash2, Search, Image as ImageIcon, HardDrive, ChevronDown, ChevronLeft, ChevronRight, KeyRound, Lock, Unlock, Eye, EyeOff, Sparkles, Cloud, Folder, ArrowUp } from "lucide-react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import PhotoLightboxModal, { LightboxPhoto } from "@/components/photo-lightbox-modal";

interface Event {
    _id: string;
    name: string;
    slug: string;
    date: string;
    created_at: string;
    storage_type?: string;
    storage_path?: string;
    drive_folder_url?: string;
    secret_code?: string;
    sync_status?: string;
    last_sync_at?: string;
}

interface Guest {
    id: string;
    name: string;
    email: string;
    phone?: string;
    selfie_path?: string;
    status: string;
    match_count: number;
    created_at: string;
    gallery_link: string;
}

interface Photo {
    id: string;
    original_file_name: string;
    thumbnail_path?: string;
    width?: number;
    height?: number;
    faces_count: number;
    status: string;
    created_at: string;
    drive_file_id?: string;
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

interface StorageInfo {
    event_storage_bytes: number;
    event_storage_mb: number;
    event_storage_gb: number;
    thumbnails_storage_bytes?: number;
    previews_storage_bytes?: number;
    originals_storage_bytes?: number;
    selfies_storage_bytes?: number;
    cloud_photos_count?: number;
    total_storage_bytes: number;
    total_storage_gb: number;
    free_storage_bytes: number;
    free_storage_gb: number;
    used_storage_bytes: number;
    used_storage_gb: number;
    photo_count: number;
    guest_count: number;
}

interface DirectoryItem {
    name: string;
    path: string;
    photos_count: number;
    has_subdirs: boolean;
}

interface Breadcrumb {
    name: string;
    path: string;
}

interface BrowseData {
    current_path: string;
    parent_path: string | null;
    breadcrumbs: Breadcrumb[];
    photos_count: number;
    directories: DirectoryItem[];
    error?: string;
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
                    const processingDone = data.pending === 0;

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

const StorageDisplay = ({ eventId, apiUrl }: { eventId: string, apiUrl: string }) => {
    const [storage, setStorage] = useState<StorageInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        const fetchStorage = async () => {
            const token = Cookies.get("admin_token");
            try {
                const res = await fetch(`${apiUrl}/events/${eventId}/storage`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setStorage(data);
                }
            } catch (error: unknown) {
                console.error("Storage fetch error:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStorage();
    }, [eventId, apiUrl]);

    if (loading) return <div className="h-16 w-full bg-muted animate-pulse rounded-xl mt-2" />;
    if (!storage) return null;

    const formatSize = (bytes: number) => {
        if (bytes >= 1024 * 1024 * 1024) {
            return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        } else if (bytes >= 1024 * 1024) {
            return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        } else if (bytes >= 1024) {
            return `${(bytes / 1024).toFixed(2)} KB`;
        }
        return `${bytes} B`;
    };

    const usagePercent = storage.total_storage_bytes > 0
        ? (storage.used_storage_bytes / storage.total_storage_bytes) * 100
        : 0;

    return (
        <div className="space-y-2 mt-3 p-3 bg-muted/40 rounded-xl border border-border/40">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
                <span className="flex items-center gap-1.5 text-foreground">
                    <HardDrive className="w-3.5 h-3.5 text-indigo-500" />
                    Storage Breakdown
                </span>
                <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground text-[10px] normal-case bg-background/80 px-2 py-0.5 rounded-md border border-border/50">
                        {formatSize(storage.event_storage_bytes)} SSD
                    </span>
                    <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                </div>
            </button>

            <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                {/* Event Storage Breakdown */}
                <div className="space-y-1.5 pt-2 border-t border-border/40 mt-1">
                    <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Local SSD Used</span>
                        <span className="font-bold text-foreground">{formatSize(storage.event_storage_bytes)}</span>
                    </div>
                    {storage.previews_storage_bytes !== undefined && (
                        <div className="flex items-center justify-between text-[9px] text-muted-foreground pl-2 border-l-2 border-indigo-500/40">
                            <span>2K Screen Previews</span>
                            <span className="font-medium text-foreground">{formatSize(storage.previews_storage_bytes)}</span>
                        </div>
                    )}
                    {storage.thumbnails_storage_bytes !== undefined && (
                        <div className="flex items-center justify-between text-[9px] text-muted-foreground pl-2 border-l-2 border-indigo-500/40">
                            <span>Grid Thumbnails</span>
                            <span className="font-medium text-foreground">{formatSize(storage.thumbnails_storage_bytes)}</span>
                        </div>
                    )}
                    {storage.selfies_storage_bytes !== undefined && storage.selfies_storage_bytes > 0 && (
                        <div className="flex items-center justify-between text-[9px] text-muted-foreground pl-2 border-l-2 border-indigo-500/40">
                            <span>Guest Selfies</span>
                            <span className="font-medium text-foreground">{formatSize(storage.selfies_storage_bytes)}</span>
                        </div>
                    )}
                    {storage.cloud_photos_count !== undefined && (
                        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-border/30 mt-1">
                            <span className="text-muted-foreground">Google Drive Cloud</span>
                            <span className="font-bold text-blue-600 dark:text-blue-400">{storage.cloud_photos_count} photos</span>
                        </div>
                    )}
                </div>

                {/* System Storage Bar */}
                <div className="space-y-1 pt-2 border-t border-border/40 mt-2">
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                        <span>Server Disk ({formatSize(storage.free_storage_bytes)} free)</span>
                        <span className="font-semibold">{usagePercent.toFixed(1)}% used</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                            className={`h-full transition-all duration-500 rounded-full ${usagePercent > 90 ? 'bg-red-500' :
                                    usagePercent > 75 ? 'bg-amber-500' :
                                        'bg-indigo-500'
                                }`}
                            style={{ width: `${Math.min(usagePercent, 100)}%` }}
                        />
                    </div>
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
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-9 w-9 p-0 text-foreground border border-border flex-shrink-0 bg-card hover:bg-purple-50 dark:hover:bg-purple-900/20"
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
    const [createStorageType, setCreateStorageType] = useState<"drive" | "local">("drive");
    const [createStoragePath, setCreateStoragePath] = useState("");
    const [updateStorageType, setUpdateStorageType] = useState<"drive" | "local">("drive");
    const [updateStoragePath, setUpdateStoragePath] = useState("");
    const [showDirBrowser, setShowDirBrowser] = useState(false);
    const [dirBrowserTarget, setDirBrowserTarget] = useState<"create" | "update">("create");
    const [browseData, setBrowseData] = useState<BrowseData | null>(null);
    const [loadingBrowse, setLoadingBrowse] = useState(false);
    const [browseFilter, setBrowseFilter] = useState("");
    const [showGuestsModal, setShowGuestsModal] = useState(false);
    const [selectedEventForGuests, setSelectedEventForGuests] = useState<Event | null>(null);
    const [guests, setGuests] = useState<Guest[]>([]);
    const [loadingGuests, setLoadingGuests] = useState(false);
    const [guestFilter, setGuestFilter] = useState("");
    const [showGalleryModal, setShowGalleryModal] = useState(false);
    const [selectedEventForGallery, setSelectedEventForGallery] = useState<Event | null>(null);
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [loadingPhotos, setLoadingPhotos] = useState(false);
    const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
    const [deletingPhotos, setDeletingPhotos] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [editingSecretEvent, setEditingSecretEvent] = useState<Event | null>(null);
    const [editSecretCode, setEditSecretCode] = useState("");
    const [showSecretPassword, setShowSecretPassword] = useState(false);
    const [savingSecret, setSavingSecret] = useState(false);
    const [galleryPage, setGalleryPage] = useState(1);
    const [galleryTotal, setGalleryTotal] = useState(0);
    const [galleryTotalPages, setGalleryTotalPages] = useState(1);
    const galleryContainerRef = useRef<HTMLDivElement>(null);


    const router = useRouter();
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

    const fetchBrowseDirectories = useCallback(async (targetPath?: string) => {
        setLoadingBrowse(true);
        setBrowseFilter("");
        try {
            const token = Cookies.get("admin_token");
            const query = targetPath ? `?path=${encodeURIComponent(targetPath)}` : "";
            const res = await fetch(`${API_URL}/events/browse-directories${query}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                const data: BrowseData = await res.json();
                setBrowseData(data);
            } else {
                toast.error("Failed to browse server directories");
            }
        } catch (error) {
            console.error("Browse directories error:", error);
            toast.error("Network error while browsing directories");
        } finally {
            setLoadingBrowse(false);
        }
    }, [API_URL]);

    const handleOpenDirBrowser = (target: "create" | "update") => {
        setDirBrowserTarget(target);
        setShowDirBrowser(true);
        const initialPath = target === "create" ? createStoragePath : updateStoragePath;
        fetchBrowseDirectories(initialPath || undefined);
    };

    const handleSelectDirectory = (chosenPath: string) => {
        if (dirBrowserTarget === "create") {
            setCreateStoragePath(chosenPath);
        } else {
            setUpdateStoragePath(chosenPath);
        }
        setShowDirBrowser(false);
        const countInfo = browseData?.photos_count ? ` (${browseData.photos_count} photos detected)` : "";
        toast.success(`Selected folder: ${chosenPath}${countInfo}`);
    };

    const fetchEvents = useCallback(async () => {
        try {
            const token = Cookies.get("admin_token");
            const response = await fetch(`${API_URL}/events`, {
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

        const payload: Record<string, any> = {
            name: formData.get("name"),
            slug: formData.get("slug"),
            date: new Date(formData.get("date") as string).toISOString(),
            storage_type: createStorageType,
            secret_code: formData.get("secret_code") || undefined
        };

        if (createStorageType === "local") {
            const pathVal = createStoragePath.trim() || (formData.get("storage_path") as string)?.trim();
            if (!pathVal) {
                toast.error("Please enter a local storage directory path");
                setCreating(false);
                return;
            }
            payload.storage_path = pathVal;
        } else {
            const urlVal = (formData.get("drive_folder_url") as string)?.trim();
            if (!urlVal) {
                toast.error("Please enter a Google Drive folder URL");
                setCreating(false);
                return;
            }
            payload.drive_folder_url = urlVal;
        }

        try {
            const response = await fetch(`${API_URL}/events`, {
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
                setCreateStoragePath("");
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
                toast.success("Started photo indexing");
                setTimeout(() => fetchEvents(), 2000);
                return;
            } else {
                const err = await response.json();
                toast.error(err.detail || "Sync failed to start");
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

    const handleUpdateStorage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEventId) return;

        const token = Cookies.get("admin_token");
        const payload: Record<string, any> = {
            storage_type: updateStorageType
        };

        if (updateStorageType === "local") {
            if (!updateStoragePath.trim()) {
                toast.error("Please enter a local storage directory path");
                return;
            }
            payload.storage_path = updateStoragePath.trim();
        } else {
            if (!driveUrl.trim()) {
                toast.error("Please enter a Google Drive folder URL");
                return;
            }
            payload.drive_folder_url = driveUrl.trim();
        }

        try {
            const response = await fetch(`${API_URL}/events/${selectedEventId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                toast.success("Storage location updated. You can now start sync.");
                setDriveUrl("");
                setUpdateStoragePath("");
                setSelectedEventId(null);
                fetchEvents();
            } else {
                const err = await response.json();
                toast.error(err.detail || "Failed to update storage location");
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

    const handleOpenEditSecret = (event: Event) => {
        setEditingSecretEvent(event);
        setEditSecretCode(event.secret_code || "");
        setShowSecretPassword(false);
    };

    const handleGeneratePin = () => {
        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        setEditSecretCode(pin);
        setShowSecretPassword(true);
    };

    const handleSaveSecret = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!editingSecretEvent) return;

        setSavingSecret(true);
        const token = Cookies.get("admin_token");
        const cleanCode = editSecretCode.trim() || null;

        try {
            const response = await fetch(`${API_URL}/events/${editingSecretEvent._id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ secret_code: cleanCode })
            });

            if (response.ok) {
                toast.success(cleanCode ? "Event passcode updated successfully!" : "Event passcode removed (event is now public)");
                setEditingSecretEvent(null);
                fetchEvents();
            } else {
                toast.error("Failed to update event passcode");
            }
        } catch (error) {
            console.error("Error updating secret code:", error);
            toast.error("Network error");
        } finally {
            setSavingSecret(false);
        }
    };

    const handleRemoveSecret = async () => {
        if (!editingSecretEvent) return;
        setEditSecretCode("");
        setSavingSecret(true);
        const token = Cookies.get("admin_token");

        try {
            const response = await fetch(`${API_URL}/events/${editingSecretEvent._id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ secret_code: null })
            });

            if (response.ok) {
                toast.success("Event passcode removed (event is now public)");
                setEditingSecretEvent(null);
                fetchEvents();
            } else {
                toast.error("Failed to remove passcode");
            }
        } catch (error) {
            console.error("Error removing secret code:", error);
            toast.error("Network error");
        } finally {
            setSavingSecret(false);
        }
    };

    const handleShowGuests = async (event: Event) => {
        setSelectedEventForGuests(event);
        setShowGuestsModal(true);
        setLoadingGuests(true);
        setGuestFilter(""); // Reset filter when opening modal

        try {
            const token = Cookies.get("admin_token");
            const response = await fetch(`${API_URL}/guests/event/${event._id}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setGuests(data.guests || []);
            } else {
                toast.error("Failed to load guests");
            }
        } catch (error) {
            console.error("Error fetching guests:", error);
            toast.error("Network error");
        } finally {
            setLoadingGuests(false);
        }
    };

    const handleDeleteGuest = async (guestId: string, guestName: string) => {
        if (!confirm(`Are you sure you want to remove ${guestName}? This will allow them to rescan their face.`)) {
            return;
        }

        try {
            const token = Cookies.get("admin_token");
            const response = await fetch(`${API_URL}/guests/${guestId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (response.ok) {
                toast.success(`${guestName} removed successfully`);
                // Refresh the guests list
                if (selectedEventForGuests) {
                    handleShowGuests(selectedEventForGuests);
                }
            } else {
                toast.error("Failed to remove guest");
            }
        } catch (error) {
            console.error("Error deleting guest:", error);
            toast.error("Network error");
        }
    };

    const handleDeleteEvent = async (eventId: string, eventName: string) => {
        if (!confirm(`⚠️ WARNING: This will permanently delete "${eventName}" and ALL associated data including:\n\n• All photos and thumbnails\n• All guest selfies and data\n• All face recognition data\n\nThis action CANNOT be undone!\n\nAre you absolutely sure?`)) {
            return;
        }

        try {
            const token = Cookies.get("admin_token");
            const response = await fetch(`${API_URL}/events/${eventId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                toast.success(`Event "${eventName}" deleted successfully. Removed ${data.deleted_photos} photos and ${data.deleted_guests} guests.`);
                fetchEvents(); // Refresh the events list
            } else {
                const error = await response.json();
                toast.error(error.detail || "Failed to delete event");
            }
        } catch (error) {
            console.error("Error deleting event:", error);
            toast.error("Network error");
        }
    };

    const handleShowGallery = async (event: Event, page: number = 1) => {
        setSelectedEventForGallery(event);
        setShowGalleryModal(true);
        setLoadingPhotos(true);
        setSelectedPhotos(new Set());
        setGalleryPage(page);

        try {
            const token = Cookies.get("admin_token");
            const response = await fetch(`${API_URL}/photos/event/${event._id}/gallery?page=${page}&limit=500`, {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setPhotos(data.photos || []);
                setGalleryTotal(data.total || 0);
                setGalleryTotalPages(data.total_pages || 1);
                galleryContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            } else {
                toast.error("Failed to load photos");
            }
        } catch (error) {
            console.error("Error fetching photos:", error);
            toast.error("Network error");
        } finally {
            setLoadingPhotos(false);
        }
    };

    const togglePhotoSelection = (photoId: string) => {
        setSelectedPhotos(prev => {
            const newSet = new Set(prev);
            if (newSet.has(photoId)) {
                newSet.delete(photoId);
            } else {
                newSet.add(photoId);
            }
            return newSet;
        });
    };

    const toggleSelectAll = () => {
        if (selectedPhotos.size === photos.length) {
            setSelectedPhotos(new Set());
        } else {
            setSelectedPhotos(new Set(photos.map(p => p.id)));
        }
    };

    const handleDeleteSelectedPhotos = async () => {
        if (selectedPhotos.size === 0) {
            toast.error("No photos selected");
            return;
        }

        if (!confirm(`Are you sure you want to delete ${selectedPhotos.size} photo(s)? This action cannot be undone.`)) {
            return;
        }

        setDeletingPhotos(true);
        try {
            const token = Cookies.get("admin_token");
            const photoIds = Array.from(selectedPhotos);

            const response = await fetch(`${API_URL}/photos/delete/bulk`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(photoIds)
            });

            if (response.ok) {
                const data = await response.json();
                toast.success(data.message);
                // Refresh the gallery on current page
                if (selectedEventForGallery) {
                    handleShowGallery(selectedEventForGallery, galleryPage);
                }
            } else {
                toast.error("Failed to delete photos");
            }
        } catch (error) {
            console.error("Error deleting photos:", error);
            toast.error("Network error");
        } finally {
            setDeletingPhotos(false);
        }
    };

    // Filter guests based on search input
    const filteredGuests = guests.filter(guest => {
        if (!guestFilter.trim()) return true;
        const searchTerm = guestFilter.toLowerCase();
        return (
            guest.name.toLowerCase().includes(searchTerm) ||
            guest.email.toLowerCase().includes(searchTerm)
        );
    });

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="bg-background p-6 transition-colors duration-300">
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
                        <CardDescription>Setup a new event and configure your photo storage source</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreateEvent} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Event Name</Label>
                                    <Input id="name" name="name" placeholder="Wedding 2026" required className="bg-background border-border" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="slug">URL Slug</Label>
                                    <Input id="slug" name="slug" placeholder="wedding-2026" required className="bg-background border-border" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="date">Event Date</Label>
                                <Input id="date" name="date" type="date" required className="bg-background border-border" />
                            </div>

                            {/* Storage Provider Selector */}
                            <div className="space-y-2">
                                <Label>Photo Storage Source</Label>
                                <div className="grid grid-cols-2 gap-2 p-1 bg-muted/60 rounded-lg border border-border">
                                    <button
                                        type="button"
                                        onClick={() => setCreateStorageType("drive")}
                                        className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                                            createStorageType === "drive"
                                                ? "bg-background text-foreground shadow-sm border border-border"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        <Cloud className="w-3.5 h-3.5 text-blue-500" />
                                        Google Drive
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCreateStorageType("local")}
                                        className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                                            createStorageType === "local"
                                                ? "bg-background text-foreground shadow-sm border border-border"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        <HardDrive className="w-3.5 h-3.5 text-emerald-500" />
                                        Local Folder / NAS
                                    </button>
                                </div>
                            </div>

                            {createStorageType === "drive" ? (
                                <div className="space-y-2">
                                    <Label htmlFor="drive_folder_url">Google Drive Folder URL</Label>
                                    <Input id="drive_folder_url" name="drive_folder_url" placeholder="https://drive.google.com/..." required className="bg-background border-border" />
                                    <p className="text-[11px] text-muted-foreground">Photos are indexed from Google Drive using configured service accounts.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="storage_path">Server / NAS Directory Path</Label>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleOpenDirBrowser("create")}
                                            className="h-7 px-2.5 text-xs text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 gap-1.5 cursor-pointer"
                                        >
                                            <Folder className="w-3.5 h-3.5" />
                                            Browse Folders
                                        </Button>
                                    </div>
                                    <div className="relative flex items-center">
                                        <Input
                                            id="storage_path"
                                            name="storage_path"
                                            value={createStoragePath}
                                            onChange={(e) => setCreateStoragePath(e.target.value)}
                                            placeholder="/photos/wedding-2026 or photos/event"
                                            required={createStorageType === "local"}
                                            className="bg-background border-border font-mono text-xs pr-20"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleOpenDirBrowser("create")}
                                            className="absolute right-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline px-2 py-1 cursor-pointer"
                                        >
                                            Browse
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">Direct directory path on server/laptop. Click <strong>Browse Folders</strong> to select your folder without manual typing.</p>
                                </div>
                            )}

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
                            Configure Storage Location
                        </CardTitle>
                        <CardDescription>Update Drive URL or local folder path for existing events</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleUpdateStorage} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Select Event</Label>
                                <select
                                    className="w-full h-10 px-3 rounded-md border border-border bg-background focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-foreground"
                                    onChange={(e) => {
                                        const id = e.target.value;
                                        setSelectedEventId(id);
                                        const ev = events.find(item => item._id === id);
                                        if (ev) {
                                            const isLocal = ev.storage_type === "local";
                                            setUpdateStorageType(isLocal ? "local" : "drive");
                                            if (isLocal) {
                                                setUpdateStoragePath(ev.storage_path || "");
                                                setDriveUrl("");
                                            } else {
                                                setDriveUrl(ev.drive_folder_url || "");
                                                setUpdateStoragePath("");
                                            }
                                        }
                                    }}
                                    value={selectedEventId || ""}
                                    required
                                >
                                    <option value="" disabled>Choose an event...</option>
                                    {events.map((event) => (
                                        <option key={event._id} value={event._id}>{event.name} ({event.storage_type === "local" ? "Local Folder" : "Google Drive"})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <Label>Storage Provider</Label>
                                <div className="grid grid-cols-2 gap-2 p-1 bg-muted/60 rounded-lg border border-border">
                                    <button
                                        type="button"
                                        onClick={() => setUpdateStorageType("drive")}
                                        className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                                            updateStorageType === "drive"
                                                ? "bg-background text-foreground shadow-sm border border-border"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        <Cloud className="w-3.5 h-3.5 text-blue-500" />
                                        Google Drive
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setUpdateStorageType("local")}
                                        className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                                            updateStorageType === "local"
                                                ? "bg-background text-foreground shadow-sm border border-border"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        <HardDrive className="w-3.5 h-3.5 text-emerald-500" />
                                        Local Folder
                                    </button>
                                </div>
                            </div>

                            {updateStorageType === "drive" ? (
                                <div className="space-y-2">
                                    <Label htmlFor="driveUrl">Google Drive Folder URL</Label>
                                    <div className="relative">
                                        <Input
                                            id="driveUrl"
                                            value={driveUrl}
                                            onChange={(e) => setDriveUrl(e.target.value)}
                                            placeholder="Paste Google Drive folder link..."
                                            required={updateStorageType === "drive"}
                                            className="pr-10 bg-background border-border"
                                        />
                                        <LinkIcon className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="updateStoragePath">Local Server / NAS Directory Path</Label>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleOpenDirBrowser("update")}
                                            className="h-7 px-2.5 text-xs text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 gap-1.5 cursor-pointer"
                                        >
                                            <Folder className="w-3.5 h-3.5" />
                                            Browse Folders
                                        </Button>
                                    </div>
                                    <div className="relative flex items-center">
                                        <Input
                                            id="updateStoragePath"
                                            value={updateStoragePath}
                                            onChange={(e) => setUpdateStoragePath(e.target.value)}
                                            placeholder="/photos/wedding-2026 or photos/event"
                                            required={updateStorageType === "local"}
                                            className="pr-20 bg-background border-border font-mono text-xs"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleOpenDirBrowser("update")}
                                            className="absolute right-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline px-2 py-1 cursor-pointer"
                                        >
                                            Browse
                                        </button>
                                    </div>
                                </div>
                            )}

                            <Button className="w-full bg-foreground text-background hover:bg-foreground/90 h-11 border-none shadow-lg" disabled={!selectedEventId}>
                                Save Storage Location
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
                                    <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-border bg-card" asChild title="Public Page">
                                        <a href={`/event/${event.slug}`} target="_blank">
                                            <Globe className="w-4 h-4 text-muted-foreground" />
                                        </a>
                                    </Button>
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

                                <div className="pt-2">
                                    <StorageDisplay
                                        eventId={event._id}
                                        apiUrl={API_URL}
                                    />
                                </div>

                                <div className="flex items-center justify-between p-2.5 bg-muted/40 rounded-xl text-xs">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {event.secret_code ? (
                                            <>
                                                <Lock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                                <span className="font-medium text-foreground text-[11px]">Passcode:</span>
                                                <code className="px-1.5 py-0.5 bg-background rounded font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400 border border-border truncate max-w-[110px]">
                                                    {event.secret_code}
                                                </code>
                                            </>
                                        ) : (
                                            <>
                                                <Unlock className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                                <span className="text-muted-foreground font-medium text-[11px]">Public Access</span>
                                            </>
                                        )}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleOpenEditSecret(event)}
                                        className="h-7 px-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 flex-shrink-0"
                                        title="Edit Secret Passcode"
                                    >
                                        <KeyRound className="w-3 h-3 mr-1" />
                                        {event.secret_code ? "Edit" : "Set Passcode"}
                                    </Button>
                                </div>

                                {event.storage_type === "local" ? (
                                    <div className="p-3 bg-muted/40 rounded-xl space-y-2">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Storage Source</p>
                                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                                                <HardDrive className="w-3 h-3" /> Local Folder
                                            </span>
                                        </div>
                                        <p className="text-xs font-mono text-foreground truncate" title={event.storage_path}>
                                            {event.storage_path || "Path not configured"}
                                        </p>
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                            <span>Last indexed:</span>
                                            <span className="font-bold">{event.last_sync_at ? new Date(event.last_sync_at).toLocaleTimeString() : 'Never'}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-3 bg-muted/40 rounded-xl space-y-2">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Storage Source</p>
                                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
                                                <Cloud className="w-3 h-3" /> Google Drive
                                            </span>
                                        </div>
                                        {event.drive_folder_url ? (
                                            <a
                                                href={event.drive_folder_url}
                                                target="_blank"
                                                className="text-xs text-indigo-600 dark:text-indigo-400 truncate block hover:underline flex items-center gap-1 font-medium"
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                                Visit Source Folder
                                            </a>
                                        ) : (
                                            <span className="text-xs text-amber-600 dark:text-amber-400 block font-medium">
                                                Drive URL not configured
                                            </span>
                                        )}
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                            <span>Last indexed:</span>
                                            <span className="font-bold">{event.last_sync_at ? new Date(event.last_sync_at).toLocaleTimeString() : 'Never'}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <Button
                                        variant="default"
                                        size="sm"
                                        disabled={
                                            syncing[event._id] ||
                                            !(event.storage_type === "local" ? event.storage_path : event.drive_folder_url) ||
                                            event.sync_status === "syncing"
                                        }
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
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-9 w-9 p-0 border border-border bg-card hover:bg-amber-50 dark:hover:bg-amber-900/20 text-foreground"
                                        onClick={() => handleOpenEditSecret(event)}
                                        title="Edit Secret Passcode"
                                    >
                                        <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-9 w-9 p-0 border border-border bg-card hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                                        onClick={() => handleShowGuests(event)}
                                        title="View Guests"
                                    >
                                        <Users className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-9 w-9 p-0 border border-border bg-card hover:bg-purple-50 dark:hover:bg-purple-900/20"
                                        onClick={() => handleShowGallery(event)}
                                        title="View Gallery"
                                    >
                                        <ImageIcon className="w-4 h-4" />
                                    </Button>
                                    <CopyButton slug={event.slug} />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-9 w-9 p-0 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        onClick={() => handleDeleteEvent(event._id, event.name)}
                                        title="Delete Event"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Guests Modal */}
            {showGuestsModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowGuestsModal(false)}>
                    <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-6xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-border flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30">
                            <div>
                                <h3 className="text-2xl font-bold text-foreground flex items-center gap-2">
                                    <Users className="w-6 h-6 text-indigo-600" />
                                    Event Guests
                                </h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {selectedEventForGuests?.name} - {guests.length} guest{guests.length !== 1 ? 's' : ''} joined
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowGuestsModal(false)}
                                className="h-8 w-8 p-0 rounded-full hover:bg-muted"
                            >
                                <X className="w-5 h-5" />
                            </Button>
                        </div>

                        {/* Search Filter */}
                        {!loadingGuests && guests.length > 0 && (
                            <div className="px-4 sm:px-6 pt-4 pb-2 border-b border-border">
                                <div className="relative">
                                    <Input
                                        type="text"
                                        placeholder="Search by name or email..."
                                        value={guestFilter}
                                        onChange={(e) => setGuestFilter(e.target.value)}
                                        className="pl-10 bg-background border-border"
                                    />
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    {guestFilter && (
                                        <button
                                            onClick={() => setGuestFilter("")}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                {guestFilter && (
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Showing {filteredGuests.length} of {guests.length} guest{guests.length !== 1 ? 's' : ''}
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
                            {loadingGuests ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                                </div>
                            ) : guests.length === 0 ? (
                                <div className="text-center py-12">
                                    <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                                    <p className="text-muted-foreground text-lg">No guests have joined this event yet</p>
                                </div>
                            ) : filteredGuests.length === 0 ? (
                                <div className="text-center py-12">
                                    <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                                    <p className="text-muted-foreground text-lg">No guests match your search</p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setGuestFilter("")}
                                        className="mt-4"
                                    >
                                        Clear filter
                                    </Button>
                                </div>
                            ) : (
                                <div className="overflow-x-auto -mx-4 sm:mx-0">
                                    <table className="w-full min-w-[640px]">
                                        <thead>
                                            <tr className="border-b border-border">
                                                <th className="text-left p-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Guest</th>
                                                <th className="text-left p-3 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Contact</th>
                                                <th className="text-center p-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                                                <th className="text-center p-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Photos</th>
                                                <th className="text-right p-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredGuests.map((guest) => (
                                                <tr
                                                    key={guest.id}
                                                    className="border-b border-border hover:bg-muted/30 transition-colors"
                                                >
                                                    <td className="p-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="relative flex-shrink-0">
                                                                {guest.selfie_path ? (
                                                                    <img
                                                                        src={`${API_URL}/guests/selfie/${guest.id}`}
                                                                        alt={guest.name}
                                                                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-indigo-200 dark:border-indigo-800"
                                                                    />
                                                                ) : (
                                                                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm sm:text-base border-2 border-indigo-200 dark:border-indigo-800">
                                                                        {guest.name.charAt(0).toUpperCase()}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-bold text-foreground text-sm sm:text-base truncate">{guest.name}</p>
                                                                <p className="text-xs text-muted-foreground truncate sm:hidden">{guest.email}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-3 hidden sm:table-cell">
                                                        <p className="text-sm text-foreground truncate">{guest.email}</p>
                                                        {guest.phone && (
                                                            <p className="text-xs text-muted-foreground mt-0.5">{guest.phone}</p>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${guest.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                                            guest.status === 'processing' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                                                                'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                                            }`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${guest.status === 'completed' ? 'bg-green-500' :
                                                                guest.status === 'processing' ? 'bg-yellow-500' :
                                                                    'bg-red-500'
                                                                }`} />
                                                            {guest.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <p className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400">{guest.match_count}</p>
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button
                                                                variant="default"
                                                                size="sm"
                                                                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1 h-8 text-xs"
                                                                asChild
                                                            >
                                                                <a href={guest.gallery_link} target="_blank" rel="noopener noreferrer">
                                                                    <ExternalLink className="w-3 h-3" />
                                                                    <span className="hidden sm:inline">Gallery</span>
                                                                </a>
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 h-8 w-8 p-0"
                                                                onClick={() => handleDeleteGuest(guest.id, guest.name)}
                                                                title="Remove guest"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Gallery Modal */}
            {showGalleryModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowGalleryModal(false)}>
                    <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-border flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
                            <div>
                                <h3 className="text-2xl font-bold text-foreground flex items-center gap-2">
                                    <ImageIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                                    Photo Gallery
                                </h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {selectedEventForGallery?.name} • {galleryTotal.toLocaleString()} total photo{galleryTotal !== 1 ? 's' : ''}
                                    {galleryTotalPages > 1 && ` (Page ${galleryPage} of ${galleryTotalPages})`}
                                    {selectedPhotos.size > 0 && ` • ${selectedPhotos.size} selected on this page`}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowGalleryModal(false)}
                                className="h-8 w-8 p-0 rounded-full hover:bg-muted"
                            >
                                <X className="w-5 h-5" />
                            </Button>
                        </div>

                        {/* Action Bar */}
                        {!loadingPhotos && photos.length > 0 && (
                            <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedPhotos.size === photos.length && photos.length > 0}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded border-border"
                                        />
                                        <span className="text-sm font-medium">Select All on Page</span>
                                    </label>
                                    {selectedPhotos.size > 0 && (
                                        <span className="text-sm text-muted-foreground">
                                            {selectedPhotos.size} of {photos.length} selected
                                        </span>
                                    )}
                                </div>
                                {selectedPhotos.size > 0 && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={handleDeleteSelectedPhotos}
                                        disabled={deletingPhotos}
                                        className="gap-2"
                                    >
                                        {deletingPhotos ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-4 h-4" />
                                        )}
                                        Delete Selected ({selectedPhotos.size})
                                    </Button>
                                )}
                            </div>
                        )}

                        <div ref={galleryContainerRef} className="p-6 overflow-y-auto max-h-[calc(90vh-230px)]">
                            {loadingPhotos ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                                </div>
                            ) : photos.length === 0 ? (
                                <div className="text-center py-12">
                                    <ImageIcon className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                                    <p className="text-muted-foreground text-lg">No photos in this event yet</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {photos.map((photo, index) => (
                                        <div
                                            key={photo.id}
                                            className={`relative group rounded-lg overflow-hidden border-2 transition-all ${selectedPhotos.has(photo.id)
                                                ? 'border-purple-500 ring-2 ring-purple-200 dark:ring-purple-800'
                                                : 'border-border hover:border-purple-300 dark:hover:border-purple-700'
                                                }`}
                                        >
                                            {/* Selection Checkbox */}
                                            <div className="absolute top-2 left-2 z-10">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPhotos.has(photo.id)}
                                                    onChange={() => togglePhotoSelection(photo.id)}
                                                    className="w-5 h-5 rounded border-2 border-white shadow-lg cursor-pointer"
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </div>

                                            {/* Photo */}
                                            <div className="aspect-square bg-muted relative">
                                                <img
                                                    src={`${API_URL}/photos/thumbnail/${photo.id}`}
                                                    alt={photo.original_file_name}
                                                    className="w-full h-full object-cover cursor-pointer"
                                                    onClick={() => togglePhotoSelection(photo.id)}
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E';
                                                    }}
                                                />

                                                {/* Overlay with info */}
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                                                    <p className="text-white text-xs text-center truncate w-full px-2">
                                                        {photo.original_file_name}
                                                    </p>
                                                    {photo.faces_count > 0 && (
                                                        <div className="bg-white/20 backdrop-blur-sm px-2 py-1 rounded text-white text-xs">
                                                            {photo.faces_count} face{photo.faces_count !== 1 ? 's' : ''}
                                                        </div>
                                                    )}
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        className="h-7 text-xs gap-1"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setLightboxIndex(index);
                                                        }}
                                                    >
                                                        <ImageIcon className="w-3 h-3" />
                                                        View Full
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Status Badge */}
                                            {photo.status !== 'processed' && (
                                                <div className="absolute top-2 right-2 z-10">
                                                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${photo.status === 'pending' ? 'bg-yellow-500 text-white' :
                                                        photo.status === 'error' ? 'bg-red-500 text-white' :
                                                            'bg-gray-500 text-white'
                                                        }`}>
                                                        {photo.status}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Pagination Footer */}
                        {!loadingPhotos && galleryTotalPages > 1 && (
                            <div className="px-6 py-3 border-t border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3">
                                <div className="text-xs text-muted-foreground font-medium">
                                    Showing{" "}
                                    <span className="font-semibold text-foreground">
                                        {((galleryPage - 1) * 500 + 1).toLocaleString()}
                                    </span>
                                    –
                                    <span className="font-semibold text-foreground">
                                        {Math.min(galleryPage * 500, galleryTotal).toLocaleString()}
                                    </span>{" "}
                                    of{" "}
                                    <span className="font-semibold text-foreground">
                                        {galleryTotal.toLocaleString()}
                                    </span>{" "}
                                    photos
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={galleryPage <= 1 || loadingPhotos}
                                        onClick={() => selectedEventForGallery && handleShowGallery(selectedEventForGallery, galleryPage - 1)}
                                        className="h-8 px-2.5 text-xs gap-1 border-border bg-card hover:bg-muted text-foreground"
                                    >
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                        Previous
                                    </Button>

                                    <div className="flex items-center gap-1 px-1">
                                        {Array.from({ length: galleryTotalPages }, (_, i) => i + 1)
                                            .filter(p => p === 1 || p === galleryTotalPages || Math.abs(p - galleryPage) <= 1)
                                            .reduce<(number | string)[]>((acc, p, idx, arr) => {
                                                if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                                                    acc.push("...");
                                                }
                                                acc.push(p);
                                                return acc;
                                            }, [])
                                            .map((item, idx) =>
                                                item === "..." ? (
                                                    <span key={`dots-${idx}`} className="px-1 text-xs text-muted-foreground">
                                                        ...
                                                    </span>
                                                ) : (
                                                    <Button
                                                        key={`page-${item}`}
                                                        variant={galleryPage === item ? "default" : "outline"}
                                                        size="sm"
                                                        disabled={loadingPhotos}
                                                        onClick={() => selectedEventForGallery && handleShowGallery(selectedEventForGallery, item as number)}
                                                        className={`h-8 min-w-8 px-2 text-xs font-semibold ${
                                                            galleryPage === item
                                                                ? "bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
                                                                : "border-border bg-card hover:bg-muted text-foreground"
                                                        }`}
                                                    >
                                                        {item}
                                                    </Button>
                                                )
                                            )}
                                    </div>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={galleryPage >= galleryTotalPages || loadingPhotos}
                                        onClick={() => selectedEventForGallery && handleShowGallery(selectedEventForGallery, galleryPage + 1)}
                                        className="h-8 px-2.5 text-xs gap-1 border-border bg-card hover:bg-muted text-foreground"
                                    >
                                        Next
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Edit Secret Passcode Modal */}
            {editingSecretEvent && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setEditingSecretEvent(null)}
                >
                    <div
                        className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6 border-b border-border flex items-center justify-between bg-gradient-to-r from-amber-50 to-indigo-50 dark:from-amber-950/30 dark:to-indigo-950/30">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-500/20">
                                    <KeyRound className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-foreground">
                                        Event Passcode & Access
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[240px]">
                                        {editingSecretEvent.name}
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingSecretEvent(null)}
                                className="h-8 w-8 p-0 rounded-full hover:bg-muted"
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>

                        <form onSubmit={handleSaveSecret} className="p-6 space-y-5">
                            {/* Current status display */}
                            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border text-xs">
                                <div className="flex items-center gap-2.5">
                                    {editingSecretEvent.secret_code ? (
                                        <>
                                            <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                            <div>
                                                <span className="font-semibold text-foreground">Protected Event</span>
                                                <p className="text-[11px] text-muted-foreground">Current code: <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{editingSecretEvent.secret_code}</span></p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <Unlock className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                            <div>
                                                <span className="font-semibold text-foreground">Public Event</span>
                                                <p className="text-[11px] text-muted-foreground">Open to anyone without a passcode</p>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Input field */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="edit_secret_code" className="text-xs font-semibold">
                                        Passcode / PIN
                                    </Label>
                                    <button
                                        type="button"
                                        onClick={handleGeneratePin}
                                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                                    >
                                        <Sparkles className="w-3.5 h-3.5" />
                                        Generate 6-digit PIN
                                    </button>
                                </div>
                                <div className="relative">
                                    <Input
                                        id="edit_secret_code"
                                        type={showSecretPassword ? "text" : "password"}
                                        value={editSecretCode}
                                        onChange={(e) => setEditSecretCode(e.target.value)}
                                        placeholder="Leave empty for public access"
                                        className="pr-10 bg-background border-border font-mono tracking-wider"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowSecretPassword(!showSecretPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                                        title={showSecretPassword ? "Hide passcode" : "Show passcode"}
                                    >
                                        {showSecretPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Guests will be required to enter this passcode before they can view the event gallery or upload selfies.
                                </p>
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center justify-between pt-3 border-t border-border gap-2">
                                {editingSecretEvent.secret_code ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={savingSecret}
                                        onClick={handleRemoveSecret}
                                        className="text-xs border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                                    >
                                        Make Public
                                    </Button>
                                ) : (
                                    <div />
                                )}

                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={savingSecret}
                                        onClick={() => setEditingSecretEvent(null)}
                                        className="text-xs"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        size="sm"
                                        disabled={savingSecret}
                                        className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100 dark:shadow-none"
                                    >
                                        {savingSecret ? (
                                            <>
                                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            "Save Passcode"
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* In-App Directory Browser Modal */}
            {showDirBrowser && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in-50 zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/20">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                                    <Folder className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-foreground text-base">Select Event Photo Folder</h3>
                                    <p className="text-xs text-muted-foreground">
                                        Browse directories on your machine and choose your photo folder
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowDirBrowser(false)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Breadcrumb Navigation Bar & Search */}
                        <div className="p-3 border-b border-border space-y-2 bg-card">
                            <div className="flex items-center gap-2">
                                {/* Up Button */}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!browseData?.parent_path || loadingBrowse}
                                    onClick={() => browseData?.parent_path && fetchBrowseDirectories(browseData.parent_path)}
                                    className="h-8 px-2 text-xs gap-1 border-border bg-background"
                                    title="Up one folder"
                                >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Up</span>
                                </Button>

                                {/* Breadcrumbs Trail */}
                                <div className="flex-1 flex items-center gap-1 text-xs font-mono bg-muted/40 px-2.5 py-1.5 rounded-lg overflow-x-auto border border-border min-w-0">
                                    {browseData?.breadcrumbs.map((crumb, idx) => (
                                        <React.Fragment key={crumb.path}>
                                            {idx > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                                            <button
                                                type="button"
                                                onClick={() => fetchBrowseDirectories(crumb.path)}
                                                className={`hover:underline truncate shrink-0 cursor-pointer ${
                                                    idx === browseData.breadcrumbs.length - 1
                                                        ? "font-bold text-indigo-600 dark:text-indigo-400"
                                                        : "text-muted-foreground hover:text-foreground"
                                                }`}
                                            >
                                                {crumb.name}
                                            </button>
                                        </React.Fragment>
                                    ))}
                                </div>

                                {/* Refresh */}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={loadingBrowse}
                                    onClick={() => fetchBrowseDirectories(browseData?.current_path)}
                                    className="h-8 w-8 p-0"
                                    title="Refresh directory"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${loadingBrowse ? 'animate-spin' : ''}`} />
                                </Button>
                            </div>

                            {/* Filter Input */}
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={browseFilter}
                                    onChange={(e) => setBrowseFilter(e.target.value)}
                                    placeholder="Filter subfolders in current view..."
                                    className="h-8 pl-8 text-xs bg-muted/20 border-border"
                                />
                                {browseFilter && (
                                    <button
                                        type="button"
                                        onClick={() => setBrowseFilter("")}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Folder Listing Content Area */}
                        <div className="p-3 overflow-y-auto flex-1 min-h-[220px] max-h-[360px] space-y-1">
                            {loadingBrowse ? (
                                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                                    <span className="text-xs">Reading directories...</span>
                                </div>
                            ) : browseData?.error ? (
                                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs">
                                    {browseData.error}
                                </div>
                            ) : (
                                <>
                                    {/* Current folder photos indicator banner */}
                                    {browseData && browseData.photos_count > 0 && (
                                        <div className="mb-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                                                    {browseData.photos_count} photo{browseData.photos_count !== 1 ? 's' : ''} detected directly in this folder
                                                </span>
                                            </div>
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => handleSelectDirectory(browseData.current_path)}
                                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                                            >
                                                Select This Folder
                                            </Button>
                                        </div>
                                    )}

                                    {/* Filtered directories */}
                                    {(() => {
                                        const filtered = (browseData?.directories || []).filter(d =>
                                            d.name.toLowerCase().includes(browseFilter.toLowerCase())
                                        );

                                        if (filtered.length === 0) {
                                            return (
                                                <div className="text-center py-10 text-muted-foreground text-xs">
                                                    {browseFilter
                                                        ? `No folders match "${browseFilter}"`
                                                        : "No subdirectories found in this folder"}
                                                </div>
                                            );
                                        }

                                        return filtered.map((dir) => (
                                            <div
                                                key={dir.path}
                                                onClick={() => fetchBrowseDirectories(dir.path)}
                                                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-muted/60 transition-colors cursor-pointer group border border-transparent hover:border-border"
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <Folder className="w-4 h-4 text-amber-500 shrink-0 group-hover:scale-110 transition-transform" />
                                                    <span className="text-xs font-medium text-foreground truncate">{dir.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {dir.photos_count > 0 && (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300">
                                                            {dir.photos_count} photo{dir.photos_count !== 1 ? 's' : ''}
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleSelectDirectory(dir.path);
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 px-2 py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded transition-all cursor-pointer"
                                                    >
                                                        Choose
                                                    </button>
                                                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <div className="w-full sm:w-auto min-w-0 text-left">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                    Current Location
                                </p>
                                <p className="text-xs font-mono text-foreground truncate max-w-sm" title={browseData?.current_path}>
                                    {browseData?.current_path || "Loading..."}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowDirBrowser(false)}
                                    className="text-xs"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={!browseData?.current_path}
                                    onClick={() => browseData?.current_path && handleSelectDirectory(browseData.current_path)}
                                    className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-100 dark:shadow-none cursor-pointer"
                                >
                                    <Check className="w-3.5 h-3.5 mr-1.5" />
                                    Select Current Folder
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Photo Lightbox Modal */}
            <PhotoLightboxModal
                photos={photos.map((p) => ({
                    id: p.id,
                    filename: p.original_file_name,
                    thumbnail_url: `/photos/thumbnail/${p.id}`,
                    preview_url: `/photos/preview/${p.id}`,
                    original_url: `/photos/original/${p.id}`,
                    drive_file_id: p.drive_file_id,
                    faces_count: p.faces_count,
                    created_at: p.created_at,
                }))}
                currentIndex={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
                onNavigate={(idx) => setLightboxIndex(idx)}
                apiUrl={API_URL}
            />
        </div>
    );
}
