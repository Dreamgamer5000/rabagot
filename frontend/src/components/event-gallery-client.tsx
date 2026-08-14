"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Sparkles,
    Camera,
    Upload,
    ArrowLeft,
    Calendar,
    Lock,
    Images,
    Loader2,
    CheckCircle2,
    RefreshCw,
    Download,
    Archive,
    X,
    User,
    ChevronDown,
    SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import Webcam from "react-webcam";
import PhotoLightboxModal, { LightboxPhoto } from "@/components/photo-lightbox-modal";
import { compressImage } from "@/lib/image-compressor";

interface EventData {
    _id: string;
    id: string;
    name: string;
    slug: string;
    date: string;
    is_protected: boolean;
}

interface PhotoItem extends LightboxPhoto {
    width?: number;
    height?: number;
}

export default function EventGalleryClient() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

    // Event & Verification States
    const [event, setEvent] = useState<EventData | null>(null);
    const [isVerified, setIsVerified] = useState(false);
    const [secretCode, setSecretCode] = useState("");
    const [verifyingCode, setVerifyingCode] = useState(false);
    const [loadingEvent, setLoadingEvent] = useState(true);

    // Photos & Gallery States
    const [photos, setPhotos] = useState<PhotoItem[]>([]);
    const [totalPhotos, setTotalPhotos] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loadingPhotos, setLoadingPhotos] = useState(false);
    const [activeTab, setActiveTab] = useState<"all" | "my">("all");

    // Lightbox Modal State
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    // AI Selfie & Face Search States
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [capturedSelfie, setCapturedSelfie] = useState<string | null>(null);
    const [useWebcam, setUseWebcam] = useState(true);
    const [guestName, setGuestName] = useState("");
    const [guestEmail, setGuestEmail] = useState("");
    const [searchingAI, setSearchingAI] = useState(false);
    const [matchedGuestId, setMatchedGuestId] = useState<string | null>(null);
    const [matchedPhotos, setMatchedPhotos] = useState<PhotoItem[]>([]);
    const [matchedGuestName, setMatchedGuestName] = useState<string | null>(null);
    const [downloadingZip, setDownloadingZip] = useState(false);

    const webcamRef = useRef<Webcam>(null);

    // 1. Initial Load: Check session passcode & fetch Event info
    useEffect(() => {
        const savedCode = sessionStorage.getItem(`event_code_${slug}`) || "";
        if (savedCode) setSecretCode(savedCode);

        // Check if user already has a saved guest search for this event
        const savedGuestInfo = localStorage.getItem(`last_guest_${slug}`);
        if (savedGuestInfo) {
            try {
                const parsed = JSON.parse(savedGuestInfo);
                if (parsed.id) {
                    setMatchedGuestId(parsed.id);
                    setMatchedGuestName(parsed.name || "Guest");
                }
            } catch (e) {
                console.error("Error parsing saved guest info:", e);
            }
        }

        const fetchEvent = async () => {
            try {
                const res = await fetch(`${API_URL}/events/public/${slug}`);
                if (res.ok) {
                    const data = await res.json();
                    setEvent(data);

                    if (!data.is_protected || savedCode) {
                        setIsVerified(true);
                    }
                } else {
                    toast.error("Event not found");
                }
            } catch (err) {
                console.error("Failed to fetch event:", err);
                toast.error("Could not load event details");
            } finally {
                setLoadingEvent(false);
            }
        };

        fetchEvent();
    }, [slug, API_URL]);

    // 2. Fetch All Event Photos
    const fetchEventPhotos = useCallback(
        async (pageNum: number = 1, append: boolean = false) => {
            if (!isVerified) return;
            setLoadingPhotos(true);

            try {
                const res = await fetch(`${API_URL}/photos/public/${slug}/gallery?page=${pageNum}&limit=40`);
                if (res.ok) {
                    const data = await res.json();
                    if (append) {
                        setPhotos((prev) => [...prev, ...data.photos]);
                    } else {
                        setPhotos(data.photos || []);
                    }
                    setTotalPhotos(data.total || 0);
                    setTotalPages(data.total_pages || 1);
                    setPage(pageNum);
                } else {
                    toast.error("Failed to load gallery photos");
                }
            } catch (err) {
                console.error("Error fetching photos:", err);
                toast.error("Error loading photos");
            } finally {
                setLoadingPhotos(false);
            }
        },
        [isVerified, slug, API_URL]
    );

    // 3. Fetch Matched Photos for Guest
    const fetchMatchedPhotos = useCallback(
        async (guestId: string) => {
            try {
                const res = await fetch(`${API_URL}/guests/${guestId}/matches?page=1&limit=100`);
                if (res.ok) {
                    const data = await res.json();
                    setMatchedPhotos(data.photos || []);
                    setMatchedGuestName(data.guest_name);
                    setActiveTab("my");
                }
            } catch (err) {
                console.error("Error fetching matched photos:", err);
            }
        },
        [API_URL]
    );

    // Trigger photos load when verified
    useEffect(() => {
        if (isVerified) {
            fetchEventPhotos(1, false);
            if (matchedGuestId) {
                fetchMatchedPhotos(matchedGuestId);
            }
        }
    }, [isVerified, fetchEventPhotos, matchedGuestId, fetchMatchedPhotos]);

    // Passcode Verification Handler
    const handleVerifyPasscode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!secretCode.trim()) {
            toast.error("Please enter the secret code");
            return;
        }

        setVerifyingCode(true);
        try {
            const res = await fetch(`${API_URL}/events/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slug, code: secretCode.trim() }),
            });

            if (res.ok) {
                sessionStorage.setItem(`event_code_${slug}`, secretCode.trim());
                setIsVerified(true);
                toast.success("Welcome to the event!");
            } else {
                toast.error("Invalid secret code. Please try again.");
            }
        } catch (err) {
            console.error("Verification error:", err);
            toast.error("Could not verify passcode");
        } finally {
            setVerifyingCode(false);
        }
    };

    // Camera Capture Handler
    const captureSelfie = useCallback(() => {
        const imageSrc = webcamRef.current?.getScreenshot();
        if (imageSrc) {
            setCapturedSelfie(imageSrc);

            const byteString = atob(imageSrc.split(",")[1]);
            const mimeString = imageSrc.split(",")[0].split(":")[1].split(";")[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], { type: mimeString });
            const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
            setSelfieFile(file);
        }
    }, [webcamRef]);

    const retakeSelfie = () => {
        setCapturedSelfie(null);
        setSelfieFile(null);
    };

    // File input handler for upload alternative
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelfieFile(file);
            setCapturedSelfie(URL.createObjectURL(file));
        }
    };

    // AI Selfie Search Submission
    const handleAISearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selfieFile) {
            toast.error("Please take or upload a selfie first");
            return;
        }

        if (!guestName.trim()) {
            toast.error("Please enter your name");
            return;
        }

        setSearchingAI(true);
        const sanitizedName = guestName.trim();
        const safeEmail = guestEmail.trim() || `${sanitizedName.toLowerCase().replace(/[^a-z0-9]/g, "") || "guest"}@guest.com`;

        try {
            // Compress and optimize selfie client-side to prevent large payload errors and speed up processing
            const optimizedSelfie = await compressImage(selfieFile);

            const formData = new FormData();
            formData.append("event_slug", slug);
            formData.append("name", sanitizedName);
            formData.append("email", safeEmail);
            formData.append("selfie", optimizedSelfie);
            if (secretCode) {
                formData.append("secret_code", secretCode);
            }

            const res = await fetch(`${API_URL}/guests/request`, {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                let errorMsg = "Failed to submit selfie";
                try {
                    const errData = await res.json();
                    if (errData && errData.detail) {
                        errorMsg = typeof errData.detail === "string" ? errData.detail : JSON.stringify(errData.detail);
                    }
                } catch {
                    const text = await res.text().catch(() => "");
                    if (text && text.length < 200) {
                        errorMsg = text;
                    } else if (res.status === 500) {
                        errorMsg = "Server error processing selfie. Please try again.";
                    }
                }
                throw new Error(errorMsg);
            }

            const data = await res.json();
            const reqId = data.request_id;

            // Poll for face match results
            let attempts = 0;
            const pollInterval = setInterval(async () => {
                attempts++;
                try {
                    const statusRes = await fetch(`${API_URL}/guests/status/${reqId}`);
                    if (statusRes.ok) {
                        const statusData = await statusRes.json();
                        if (statusData.status === "completed") {
                            clearInterval(pollInterval);
                            setSearchingAI(false);
                            setIsSearchModalOpen(false);
                            setMatchedGuestId(reqId);
                            setMatchedGuestName(guestName.trim());

                            localStorage.setItem(
                                `last_guest_${slug}`,
                                JSON.stringify({ id: reqId, name: guestName.trim() })
                            );

                            toast.success(`Found ${statusData.match_count || 0} matching photos!`);
                            fetchMatchedPhotos(reqId);
                        } else if (statusData.status === "error") {
                            clearInterval(pollInterval);
                            setSearchingAI(false);
                            toast.error(statusData.error || "No faces matched or an error occurred.");
                        }
                    }
                } catch (pollErr) {
                    console.error("Polling error:", pollErr);
                }

                if (attempts > 30) {
                    clearInterval(pollInterval);
                    setSearchingAI(false);
                    toast.error("Search timed out. Please try again.");
                }
            }, 2000);
        } catch (err) {
            console.error("AI Search Error:", err);
            setSearchingAI(false);
            toast.error(err instanceof Error ? err.message : "Face search failed");
        }
    };

    // Download Matched Photos ZIP
    const handleDownloadZip = async () => {
        if (!matchedGuestId) return;
        setDownloadingZip(true);
        try {
            const res = await fetch(`${API_URL}/guests/${matchedGuestId}/download-zip`);
            if (!res.ok) throw new Error("Failed to create ZIP");

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${slug}-${matchedGuestName || "photos"}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success("ZIP download started!");
        } catch (err) {
            console.error("Download ZIP error:", err);
            toast.error("Could not download photos archive");
        } finally {
            setDownloadingZip(false);
        }
    };

    // Determine which photos array to display in lightbox based on active tab
    const currentPhotoList = activeTab === "my" ? matchedPhotos : photos;

    if (loadingEvent) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-9 h-9 animate-spin text-indigo-600" />
                <p className="text-muted-foreground text-sm font-medium">Loading event...</p>
            </div>
        );
    }

    if (!event) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
                <Card className="max-w-md w-full text-center border-border shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-xl">Event Not Found</CardTitle>
                        <CardDescription>This event link may be invalid or expired.</CardDescription>
                    </CardHeader>
                    <CardFooter className="justify-center">
                        <Button onClick={() => router.push("/events")} variant="default">
                            Browse All Events
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    // Passcode Gate View
    if (!isVerified) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100/30 via-background to-blue-100/30">
                <Card className="max-w-md w-full border border-border/80 shadow-2xl bg-card/90 backdrop-blur-xl">
                    <CardHeader className="text-center space-y-2">
                        <div className="mx-auto w-12 h-12 bg-indigo-600/10 text-indigo-600 rounded-2xl flex items-center justify-center mb-1">
                            <Lock className="w-6 h-6" />
                        </div>
                        <CardTitle className="text-2xl font-bold">{event.name}</CardTitle>
                        <CardDescription>This event is passcode protected. Please enter the code to view photos.</CardDescription>
                    </CardHeader>
                    <form onSubmit={handleVerifyPasscode}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="secretCode">Event Passcode</Label>
                                <Input
                                    id="secretCode"
                                    type="password"
                                    placeholder="Enter passcode..."
                                    value={secretCode}
                                    onChange={(e) => setSecretCode(e.target.value)}
                                    autoFocus
                                    className="h-11 text-center tracking-widest text-lg font-mono"
                                />
                            </div>
                        </CardContent>
                        <CardFooter className="flex flex-col gap-2">
                            <Button type="submit" className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 font-semibold" disabled={verifyingCode}>
                                {verifyingCode ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                Unlock Event Gallery
                            </Button>
                            <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={() => router.push("/events")}>
                                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Events
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            {/* Top Navigation & Sticky Header */}
            <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl transition-all">
                <div className="container mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    {/* Left: Back button & Event Name */}
                    <div className="flex items-center gap-3 min-w-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push("/events")}
                            className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground shrink-0"
                            title="Back to Events"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>

                        <div className="min-w-0">
                            <h1 className="text-lg sm:text-xl font-bold truncate leading-tight flex items-center gap-2">
                                {event.name}
                            </h1>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {new Date(event.date).toLocaleDateString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                    })}
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1 font-medium text-foreground/80">
                                    <Images className="w-3.5 h-3.5 text-indigo-500" />
                                    {totalPhotos} photo{totalPhotos !== 1 ? "s" : ""}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Primary "Search My Photos (AI)" Action Button */}
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={() => {
                                setIsSearchModalOpen(true);
                                setCapturedSelfie(null);
                                setSelfieFile(null);
                            }}
                            className="h-10 px-4 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all rounded-full flex items-center gap-2"
                        >
                            <Sparkles className="w-4 h-4 animate-pulse text-amber-300" />
                            <span>Find My Photos</span>
                        </Button>
                    </div>
                </div>

                {/* Sub-Header: Tabs (All Photos vs My Matches) */}
                {matchedGuestId && (
                    <div className="border-t border-border/40 bg-muted/30">
                        <div className="container mx-auto px-4 py-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setActiveTab("all")}
                                    className={`px-3 py-1 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 ${
                                        activeTab === "all"
                                            ? "bg-indigo-600 text-white shadow-sm"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                    }`}
                                >
                                    <Images className="w-3.5 h-3.5" />
                                    All Photos ({totalPhotos})
                                </button>
                                <button
                                    onClick={() => setActiveTab("my")}
                                    className={`px-3 py-1 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 ${
                                        activeTab === "my"
                                            ? "bg-indigo-600 text-white shadow-sm"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                    }`}
                                >
                                    <User className="w-3.5 h-3.5 text-amber-300" />
                                    {matchedGuestName}&apos;s Photos ({matchedPhotos.length})
                                </button>
                            </div>

                            {activeTab === "my" && matchedPhotos.length > 0 && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleDownloadZip}
                                    disabled={downloadingZip}
                                    className="h-7 text-xs gap-1 font-medium bg-background/80 hover:bg-background border border-border shadow-xs"
                                >
                                    {downloadingZip ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Archive className="w-3 h-3 text-indigo-500" />}
                                    Download All ({matchedPhotos.length})
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </header>

            {/* Main Content Area */}
            <main className="container mx-auto px-4 py-6 flex-1">
                {/* Photo Grid */}
                {activeTab === "all" ? (
                    <div>
                        {photos.length === 0 && !loadingPhotos ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <div className="w-16 h-16 bg-muted/60 text-muted-foreground rounded-2xl flex items-center justify-center mb-4">
                                    <Images className="w-8 h-8" />
                                </div>
                                <h3 className="text-lg font-semibold mb-1">No Photos in this Event Yet</h3>
                                <p className="text-sm text-muted-foreground max-w-sm mb-6">
                                    Photos from Google Drive or uploads are still syncing. Check back shortly!
                                </p>
                                <Button variant="outline" size="sm" onClick={() => fetchEventPhotos(1, false)} className="gap-2">
                                    <RefreshCw className="w-4 h-4" /> Refresh Gallery
                                </Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                                {photos.map((photo, index) => (
                                    <div
                                        key={photo.id}
                                        onClick={() => setLightboxIndex(index)}
                                        className="group relative aspect-square bg-muted/40 rounded-xl overflow-hidden cursor-pointer border border-border/40 hover:border-indigo-500/50 transition-all duration-300 shadow-xs hover:shadow-lg hover:-translate-y-0.5"
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={
                                                photo.thumbnail_url?.startsWith("http")
                                                    ? photo.thumbnail_url
                                                    : `${API_URL}${photo.thumbnail_url}`
                                            }
                                            alt={photo.filename}
                                            loading="lazy"
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src =
                                                    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23222" width="100" height="100"/%3E%3Ctext fill="%23666" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EPhoto%3C/text%3E%3C/svg%3E';
                                            }}
                                        />

                                        {/* Overlay gradient on hover */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5">
                                            <p className="text-white text-xs font-medium truncate w-full">
                                                {photo.filename}
                                            </p>
                                        </div>

                                        {/* Face count badge (if faces present) */}
                                        {photo.faces_count && photo.faces_count > 0 ? (
                                            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-md text-[10px] font-medium text-white/90">
                                                {photo.faces_count} {photo.faces_count === 1 ? "face" : "faces"}
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Load More Button */}
                        {page < totalPages && (
                            <div className="flex justify-center mt-10 mb-6">
                                <Button
                                    variant="outline"
                                    onClick={() => fetchEventPhotos(page + 1, true)}
                                    disabled={loadingPhotos}
                                    className="h-11 px-8 rounded-full border-border/80 hover:bg-muted font-medium shadow-xs"
                                >
                                    {loadingPhotos ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                    Load More Photos ({totalPhotos - photos.length} remaining)
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    /* My Matches View */
                    <div>
                        {matchedPhotos.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mb-4">
                                    <User className="w-8 h-8" />
                                </div>
                                <h3 className="text-lg font-semibold mb-1">No Matching Photos Found</h3>
                                <p className="text-sm text-muted-foreground max-w-sm mb-6">
                                    We couldn&apos;t find photos matching your selfie. Try taking another selfie with good lighting.
                                </p>
                                <Button
                                    onClick={() => setIsSearchModalOpen(true)}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6"
                                >
                                    <Camera className="w-4 h-4 mr-2" /> Try Another Selfie
                                </Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                                {matchedPhotos.map((photo, index) => (
                                    <div
                                        key={photo.id}
                                        onClick={() => setLightboxIndex(index)}
                                        className="group relative aspect-square bg-muted/40 rounded-xl overflow-hidden cursor-pointer border border-border/40 hover:border-indigo-500/50 transition-all duration-300 shadow-xs hover:shadow-lg hover:-translate-y-0.5"
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={
                                                photo.thumbnail_url?.startsWith("http")
                                                    ? photo.thumbnail_url
                                                    : `${API_URL}${photo.thumbnail_url}`
                                            }
                                            alt={photo.filename}
                                            loading="lazy"
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        />

                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5">
                                            <p className="text-white text-xs font-medium truncate w-full">
                                                {photo.filename}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* AI Selfie Search Modal */}
            {isSearchModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
                    <Card className="w-full max-w-lg border-border/80 shadow-2xl bg-card/95 backdrop-blur-xl relative overflow-hidden">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                if (!searchingAI) setIsSearchModalOpen(false);
                            }}
                            disabled={searchingAI}
                            className="absolute top-4 right-4 h-8 w-8 text-muted-foreground hover:text-foreground rounded-full z-10"
                        >
                            <X className="w-5 h-5" />
                        </Button>

                        <CardHeader className="text-center pb-4">
                            <div className="mx-auto w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl flex items-center justify-center mb-2 shadow-lg shadow-indigo-500/20">
                                <Sparkles className="w-6 h-6" />
                            </div>
                            <CardTitle className="text-2xl font-bold">Find Your Photos</CardTitle>
                            <CardDescription>
                                Take a selfie and our AI will automatically find all event photos featuring you.
                            </CardDescription>
                        </CardHeader>

                        <form onSubmit={handleAISearch}>
                            <CardContent className="space-y-4">
                                {/* Camera / Upload View Area */}
                                <div className="relative aspect-4/3 w-full bg-black/90 rounded-2xl overflow-hidden border border-border flex items-center justify-center shadow-inner">
                                    {searchingAI ? (
                                        <div className="flex flex-col items-center justify-center text-center p-6 space-y-4">
                                            <div className="relative">
                                                <div className="w-20 h-20 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin" />
                                                <Sparkles className="w-8 h-8 text-indigo-400 absolute inset-0 m-auto animate-pulse" />
                                            </div>
                                            <div>
                                                <h4 className="text-lg font-semibold text-white">Scanning Event Photos...</h4>
                                                <p className="text-xs text-neutral-400 mt-1">
                                                    Extracting facial embeddings and matching photos with AI
                                                </p>
                                            </div>
                                        </div>
                                    ) : capturedSelfie ? (
                                        <div className="relative w-full h-full">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={capturedSelfie}
                                                alt="Captured Selfie"
                                                className="w-full h-full object-cover"
                                            />
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                onClick={retakeSelfie}
                                                className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white border border-white/20 backdrop-blur-md rounded-full shadow-lg"
                                            >
                                                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retake
                                            </Button>
                                        </div>
                                    ) : useWebcam ? (
                                        <div className="relative w-full h-full flex flex-col items-center justify-center">
                                            <Webcam
                                                audio={false}
                                                ref={webcamRef}
                                                screenshotFormat="image/jpeg"
                                                videoConstraints={{
                                                    width: 720,
                                                    height: 540,
                                                    facingMode: "user",
                                                }}
                                                className="w-full h-full object-cover"
                                                onUserMediaError={() => {
                                                    setUseWebcam(false);
                                                    toast.info("Camera not available. Switched to file upload.");
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                onClick={captureSelfie}
                                                className="absolute bottom-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-full px-6 shadow-xl border border-white/20"
                                            >
                                                <Camera className="w-4 h-4 mr-2" /> Take Photo
                                            </Button>
                                        </div>
                                    ) : (
                                        <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-neutral-900 transition-colors p-6">
                                            <Upload className="w-10 h-10 text-neutral-400 mb-2" />
                                            <span className="text-sm font-medium text-white">Click to upload a selfie photo</span>
                                            <span className="text-xs text-neutral-500 mt-1">JPG, PNG or WEBP</span>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleFileUpload}
                                            />
                                        </label>
                                    )}
                                </div>

                                {/* Switch Camera / Upload Toggle */}
                                {!capturedSelfie && !searchingAI && (
                                    <div className="flex justify-center">
                                        <button
                                            type="button"
                                            onClick={() => setUseWebcam(!useWebcam)}
                                            className="text-xs text-indigo-500 hover:text-indigo-600 font-medium underline underline-offset-4"
                                        >
                                            {useWebcam ? "Or upload a photo from device" : "Or use live camera"}
                                        </button>
                                    </div>
                                )}

                                {/* Guest Name & Email Input */}
                                {!searchingAI && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="guestName" className="text-xs font-medium">
                                                Your Name *
                                            </Label>
                                            <Input
                                                id="guestName"
                                                placeholder="e.g. Sarah"
                                                value={guestName}
                                                onChange={(e) => setGuestName(e.target.value)}
                                                required
                                                className="h-10"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="guestEmail" className="text-xs font-medium text-muted-foreground">
                                                Email (Optional)
                                            </Label>
                                            <Input
                                                id="guestEmail"
                                                type="email"
                                                placeholder="sarah@example.com"
                                                value={guestEmail}
                                                onChange={(e) => setGuestEmail(e.target.value)}
                                                className="h-10"
                                            />
                                        </div>
                                    </div>
                                )}
                            </CardContent>

                            {!searchingAI && (
                                <CardFooter className="pt-2">
                                    <Button
                                        type="submit"
                                        disabled={!capturedSelfie || !guestName.trim()}
                                        className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 font-semibold rounded-xl"
                                    >
                                        <Sparkles className="w-4 h-4 mr-2" /> Start AI Face Search
                                    </Button>
                                </CardFooter>
                            )}
                        </form>
                    </Card>
                </div>
            )}

            {/* Reusable Lightbox Modal */}
            <PhotoLightboxModal
                photos={currentPhotoList}
                currentIndex={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
                onNavigate={(index) => setLightboxIndex(index)}
                apiUrl={API_URL}
            />
        </div>
    );
}
