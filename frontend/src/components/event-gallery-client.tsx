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
    Check,
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
import { trackEvent } from "@/lib/analytics";

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
    const [matchedPage, setMatchedPage] = useState(1);
    const [matchedTotalPages, setMatchedTotalPages] = useState(1);
    const [matchedTotalCount, setMatchedTotalCount] = useState(0);
    const [loadingMoreMatches, setLoadingMoreMatches] = useState(false);
    const [downloadingZip, setDownloadingZip] = useState(false);

    // Multi-Select Photos & Bulk ZIP Download
    const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
    const [downloadingSelectedZip, setDownloadingSelectedZip] = useState(false);

    // Smart Scroll-Up Sticky Header State
    const [isHeaderVisible, setIsHeaderVisible] = useState(true);

    // Instant Auto-hide header on scroll down, immediately reveal on scroll up in sync with navbar
    useEffect(() => {
        let prevScrollY = window.scrollY;
        let ticking = false;

        const handleScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const currentScrollY = window.scrollY;

                    // Always keep header visible when near the top of the page
                    if (currentScrollY < 10) {
                        setIsHeaderVisible(true);
                    } else if (currentScrollY > prevScrollY && currentScrollY > 60) {
                        // Scrolling DOWN -> Hide header to maximize photo viewing area
                        setIsHeaderVisible(false);
                    } else if (currentScrollY < prevScrollY) {
                        // Scrolling UP -> Immediately slide header down into view
                        setIsHeaderVisible(true);
                    }

                    prevScrollY = currentScrollY;
                    ticking = false;
                });
                ticking = true;
            }
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const toggleSelectPhoto = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setSelectedPhotoIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const selectAllCurrentPhotos = () => {
        const currentList = activeTab === "all" ? photos : matchedPhotos;
        if (selectedPhotoIds.size === currentList.length) {
            setSelectedPhotoIds(new Set());
        } else {
            setSelectedPhotoIds(new Set(currentList.map((p) => p.id)));
        }
    };

    const handleDownloadSelectedZip = async () => {
        if (selectedPhotoIds.size === 0) return;
        setDownloadingSelectedZip(true);
        const count = selectedPhotoIds.size;
        const toastId = toast.loading(
            `Packaging ${count} selected photo${count !== 1 ? 's' : ''} into ZIP...`,
            {
                description: "Generating archive on server. If another download is in progress, your request is queued automatically. Please keep this tab open!",
                duration: 90000,
            }
        );
        try {
            const res = await fetch(`${API_URL}/photos/download-zip`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    photo_ids: Array.from(selectedPhotoIds),
                    zip_name: `${event?.slug || "event"}_selected_${count}_photos.zip`,
                }),
            });
            if (!res.ok) throw new Error("Failed to generate ZIP");
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${event?.slug || "event"}_selected_${count}_photos.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.dismiss(toastId);
            toast.success(`Downloaded ${count} photos in ZIP!`);
            trackEvent("batch_zip_downloaded", {
                event: slug,
                type: "selected_photos",
                photo_count: count,
            });
            setSelectedPhotoIds(new Set());
        } catch (err) {
            console.error("Bulk download error:", err);
            toast.dismiss(toastId);
            toast.error("Failed to download selected photos");
        } finally {
            setDownloadingSelectedZip(false);
        }
    };

    const webcamRef = useRef<Webcam>(null);
    const allPhotosSentinelRef = useRef<HTMLDivElement>(null);
    const matchedPhotosSentinelRef = useRef<HTMLDivElement>(null);
    const isFetchingPhotosRef = useRef(false);
    const isFetchingMatchesRef = useRef(false);

    const remainingPhotos = Math.max(0, totalPhotos - photos.length);
    const remainingMatchedPhotos = Math.max(0, matchedTotalCount - matchedPhotos.length);

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
            if (!isVerified || isFetchingPhotosRef.current) return;
            isFetchingPhotosRef.current = true;
            setLoadingPhotos(true);

            try {
                const res = await fetch(`${API_URL}/photos/public/${slug}/gallery?page=${pageNum}&limit=40`);
                if (res.ok) {
                    const data = await res.json();
                    if (append) {
                        setPhotos((prev) => {
                            const existingIds = new Set(prev.map((p) => p.id));
                            const newUnique = (data.photos || []).filter((p: PhotoItem) => !existingIds.has(p.id));
                            return [...prev, ...newUnique];
                        });
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
                isFetchingPhotosRef.current = false;
                setLoadingPhotos(false);
            }
        },
        [isVerified, slug, API_URL]
    );

    // 3. Fetch Matched Photos for Guest
    const fetchMatchedPhotos = useCallback(
        async (guestId: string, pageNum: number = 1, append: boolean = false) => {
            if (isFetchingMatchesRef.current) return;
            isFetchingMatchesRef.current = true;
            try {
                if (append) {
                    setLoadingMoreMatches(true);
                }
                const res = await fetch(`${API_URL}/guests/${guestId}/matches?page=${pageNum}&limit=200`);
                if (res.ok) {
                    const data = await res.json();
                    if (append) {
                        setMatchedPhotos((prev) => {
                            const existingIds = new Set(prev.map((p) => p.id));
                            const newUnique = (data.photos || []).filter((p: PhotoItem) => !existingIds.has(p.id));
                            return [...prev, ...newUnique];
                        });
                    } else {
                        setMatchedPhotos(data.photos || []);
                    }
                    setMatchedGuestName(data.guest_name);
                    setMatchedTotalCount(data.match_count || 0);
                    setMatchedTotalPages(data.total_pages || 1);
                    setMatchedPage(pageNum);
                    if (!append) {
                        setActiveTab("my");
                    }
                } else if (res.status === 404) {
                    // Stale guest search session (record deleted on server)
                    localStorage.removeItem(`last_guest_${slug}`);
                    setMatchedGuestId(null);
                    setMatchedPhotos([]);
                }
            } catch (err) {
                console.error("Error fetching matched photos:", err);
            } finally {
                isFetchingMatchesRef.current = false;
                setLoadingMoreMatches(false);
            }
        },
        [API_URL, slug]
    );

    // Trigger photos load when verified
    useEffect(() => {
        if (isVerified) {
            fetchEventPhotos(1, false);
            if (matchedGuestId) {
                fetchMatchedPhotos(matchedGuestId, 1, false);
            }
        }
    }, [isVerified, fetchEventPhotos, matchedGuestId, fetchMatchedPhotos]);

    // Auto-load Infinite Scroll for All Photos
    useEffect(() => {
        if (activeTab !== "all" || !isVerified) return;
        const sentinel = allPhotosSentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && !isFetchingPhotosRef.current && page < totalPages) {
                    fetchEventPhotos(page + 1, true);
                }
            },
            { rootMargin: "350px" }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [activeTab, isVerified, page, totalPages, fetchEventPhotos]);

    // Auto-load Infinite Scroll for Matched Photos
    useEffect(() => {
        if (activeTab !== "my" || !matchedGuestId) return;
        const sentinel = matchedPhotosSentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && !isFetchingMatchesRef.current && matchedPage < matchedTotalPages) {
                    fetchMatchedPhotos(matchedGuestId, matchedPage + 1, true);
                }
            },
            { rootMargin: "350px" }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [activeTab, matchedGuestId, matchedPage, matchedTotalPages, fetchMatchedPhotos]);

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
            trackEvent("selfie_captured", { mode: "live_camera", event: slug });
        }
    }, [webcamRef, slug]);

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
            trackEvent("selfie_captured", { mode: "file_upload", event: slug });
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

        trackEvent("selfie_search_submitted", {
            event: slug,
            has_email: Boolean(guestEmail.trim()),
        });

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
                            fetchMatchedPhotos(reqId, 1, false);
                            trackEvent("selfie_matches_returned", {
                                event: slug,
                                match_count: statusData.match_count || 0,
                            });
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
        const count = matchedTotalCount || matchedPhotos.length;
        const toastId = toast.loading(
            `Packaging ${count} high-res photos into ZIP...`,
            {
                description: "Generating your archive on the server. Your download will start automatically in a few seconds!",
                duration: 60000,
            }
        );
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
            toast.dismiss(toastId);
            toast.success(`ZIP ready! Download started for ${count} photos.`);
            trackEvent("batch_zip_downloaded", {
                event: slug,
                photo_count: count,
            });
        } catch (err) {
            console.error("Download ZIP error:", err);
            toast.dismiss(toastId);
            toast.error("Could not download photos archive. Please try again.");
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
            {/* Top Navigation & Smart Scroll-Up Sticky Header (offset below 64px global navbar) */}
            <header
                className={`sticky top-16 z-40 w-full border-b border-border/60 bg-background/90 backdrop-blur-xl transition-transform duration-200 ease-out shadow-xs ${
                    isHeaderVisible ? "translate-y-0" : "-translate-y-[calc(100%+4.5rem)]"
                }`}
            >
                <div className="container mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2 sm:gap-3">
                    {/* Left: Back button & Event Name */}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push("/events")}
                            className="h-8 w-8 sm:h-9 sm:w-9 rounded-full text-muted-foreground hover:text-foreground shrink-0"
                            title="Back to Events"
                        >
                            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                        </Button>

                        <div className="min-w-0">
                            <h1 className="text-base sm:text-xl font-bold truncate leading-tight flex items-center gap-2">
                                {event.name}
                            </h1>
                            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                    {new Date(event.date).toLocaleDateString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                    })}
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1 font-medium text-foreground/80">
                                    <Images className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-500" />
                                    {totalPhotos} photo{totalPhotos !== 1 ? "s" : ""}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Primary "Search My Photos (AI)" Action Button */}
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            onClick={() => {
                                setIsSearchModalOpen(true);
                                setCapturedSelfie(null);
                                setSelfieFile(null);
                                trackEvent("selfie_modal_opened", { event: slug });
                            }}
                            className="h-9 sm:h-10 px-3 sm:px-4 bg-gradient-to-r from-[#1B72E8] via-[#8E51DA] to-[#D94F70] hover:brightness-105 text-white font-medium shadow-sm hover:shadow-md border border-white/15 active:scale-[0.98] transition-all rounded-full flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
                        >
                            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/95 shrink-0" />
                            <span className="hidden sm:inline">Find Photos with 1 Selfie</span>
                            <span className="sm:hidden inline">Find with Selfie</span>
                        </Button>
                    </div>
                </div>

                {/* Sub-Header: Tabs (All Photos vs My Matches) */}
                {matchedGuestId && (
                    <div className="border-t border-border/40 bg-muted/30">
                        <div className="container mx-auto px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                                <button
                                    onClick={() => setActiveTab("all")}
                                    className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 shrink-0 ${
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
                                    className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 min-w-0 max-w-[160px] sm:max-w-none ${
                                        activeTab === "my"
                                            ? "bg-indigo-600 text-white shadow-sm"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                    }`}
                                >
                                    <User className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                                    <span className="truncate">{matchedGuestName}&apos;s Photos ({matchedTotalCount || matchedPhotos.length})</span>
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
                                    {downloadingZip ? (
                                        <>
                                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                            <span>Packaging ZIP...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Archive className="w-3 h-3 text-indigo-500" />
                                            <span>Download All ({matchedTotalCount || matchedPhotos.length})</span>
                                        </>
                                    )}
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
                                        onClick={() => {
                                            setLightboxIndex(index);
                                            trackEvent("lightbox_photo_viewed", {
                                                tab: activeTab,
                                                photo_id: photo.id,
                                            });
                                        }}
                                        className={`group relative aspect-square bg-muted/40 rounded-xl overflow-hidden cursor-pointer border transition-all duration-300 shadow-xs hover:shadow-lg hover:-translate-y-0.5 ${
                                            selectedPhotoIds.has(photo.id)
                                                ? "border-indigo-500 ring-2 ring-indigo-500/80 shadow-indigo-500/10"
                                                : "border-border/40 hover:border-indigo-500/50"
                                        }`}
                                    >
                                        {/* Top-Left Selection Checkbox */}
                                        <button
                                            type="button"
                                            onClick={(e) => toggleSelectPhoto(photo.id, e)}
                                            className={`absolute top-2 left-2 z-20 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 shadow-md ${
                                                selectedPhotoIds.has(photo.id)
                                                    ? "bg-indigo-600 text-white ring-2 ring-white/90 scale-100 opacity-100"
                                                    : "bg-black/50 text-transparent border border-white/50 hover:bg-black/80 hover:border-white opacity-0 group-hover:opacity-100 hover:scale-105"
                                            }`}
                                            title={selectedPhotoIds.has(photo.id) ? "Deselect Photo" : "Select Photo"}
                                        >
                                            <Check className={`w-4 h-4 stroke-[3] ${selectedPhotoIds.has(photo.id) ? "text-white" : "opacity-0"}`} />
                                        </button>

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

                        {/* Auto-Load Infinite Scroll Sentinel & Remaining Counter */}
                        {photos.length > 0 && (
                            page < totalPages ? (
                                <div
                                    ref={allPhotosSentinelRef}
                                    className="flex flex-col items-center justify-center py-12 my-6"
                                >
                                    <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-muted/60 border border-border/60 backdrop-blur-md shadow-xs">
                                        {loadingPhotos ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                                                <span className="text-xs sm:text-sm font-medium text-foreground">
                                                    Loading photos... ({remainingPhotos} remaining)
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="relative flex h-2.5 w-2.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                                                </span>
                                                <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                                                    {remainingPhotos} photo{remainingPhotos === 1 ? "" : "s"} remaining • Auto-loading as you scroll
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center py-12 my-6">
                                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/30 border border-border/30 text-xs text-muted-foreground/80">
                                        <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[2.5]" />
                                        <span>All {totalPhotos} photos loaded</span>
                                    </div>
                                </div>
                            )
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
                                        className={`group relative aspect-square bg-muted/40 rounded-xl overflow-hidden cursor-pointer border transition-all duration-300 shadow-xs hover:shadow-lg hover:-translate-y-0.5 ${
                                            selectedPhotoIds.has(photo.id)
                                                ? "border-indigo-500 ring-2 ring-indigo-500/80 shadow-indigo-500/10"
                                                : "border-border/40 hover:border-indigo-500/50"
                                        }`}
                                    >
                                        {/* Top-Left Selection Checkbox */}
                                        <button
                                            type="button"
                                            onClick={(e) => toggleSelectPhoto(photo.id, e)}
                                            className={`absolute top-2 left-2 z-20 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 shadow-md ${
                                                selectedPhotoIds.has(photo.id)
                                                    ? "bg-indigo-600 text-white ring-2 ring-white/90 scale-100 opacity-100"
                                                    : "bg-black/50 text-transparent border border-white/50 hover:bg-black/80 hover:border-white opacity-0 group-hover:opacity-100 hover:scale-105"
                                            }`}
                                            title={selectedPhotoIds.has(photo.id) ? "Deselect Photo" : "Select Photo"}
                                        >
                                            <Check className={`w-4 h-4 stroke-[3] ${selectedPhotoIds.has(photo.id) ? "text-white" : "opacity-0"}`} />
                                        </button>

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

                        {/* Auto-Load Infinite Scroll Sentinel & Remaining Counter for Matched Photos */}
                        {matchedPhotos.length > 0 && (
                            matchedPage < matchedTotalPages ? (
                                <div
                                    ref={matchedPhotosSentinelRef}
                                    className="flex flex-col items-center justify-center py-12 my-6"
                                >
                                    <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-muted/60 border border-border/60 backdrop-blur-md shadow-xs">
                                        {loadingMoreMatches ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                                                <span className="text-xs sm:text-sm font-medium text-foreground">
                                                    Loading photos... ({remainingMatchedPhotos} remaining)
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="relative flex h-2.5 w-2.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                                                </span>
                                                <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                                                    {remainingMatchedPhotos} photo{remainingMatchedPhotos === 1 ? "" : "s"} remaining • Auto-loading as you scroll
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center py-12 my-6">
                                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/30 border border-border/30 text-xs text-muted-foreground/80">
                                        <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[2.5]" />
                                        <span>All {matchedTotalCount} matched photos loaded</span>
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                )}
            </main>

            {/* Floating Bulk Selection Action Dock */}
            {selectedPhotoIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-neutral-900/95 text-white backdrop-blur-xl border border-white/15 px-4 py-2.5 rounded-full shadow-2xl animate-in slide-in-from-bottom-5">
                    <div className="flex items-center gap-2 pl-1">
                        <span className="text-xs font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 px-2.5 py-0.5 rounded-full">
                            {selectedPhotoIds.size} selected
                        </span>
                    </div>

                    <div className="h-4 w-px bg-white/20" />

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={selectAllCurrentPhotos}
                        className="h-8 text-xs text-neutral-300 hover:text-white hover:bg-white/10 rounded-full"
                    >
                        {selectedPhotoIds.size === (activeTab === "all" ? photos.length : matchedPhotos.length) ? "Deselect All" : "Select All"}
                    </Button>

                    <Button
                        size="sm"
                        onClick={handleDownloadSelectedZip}
                        disabled={downloadingSelectedZip}
                        className="h-8 px-4 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-full shadow-md gap-1.5 active:scale-[0.98] transition-all"
                    >
                        {downloadingSelectedZip ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Packaging ZIP...</span>
                            </>
                        ) : (
                            <>
                                <Download className="w-3.5 h-3.5" />
                                <span>Download ZIP ({selectedPhotoIds.size})</span>
                            </>
                        )}
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedPhotoIds(new Set())}
                        className="h-7 w-7 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full"
                        title="Clear selection"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            )}

            {/* AI Selfie Search Modal */}
            {isSearchModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in overflow-y-auto">
                    <Card className="w-full max-w-lg max-h-[92dvh] my-auto flex flex-col border-border/80 shadow-2xl bg-card/95 backdrop-blur-xl relative overflow-hidden">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                if (!searchingAI) setIsSearchModalOpen(false);
                            }}
                            disabled={searchingAI}
                            className="absolute top-3 right-3 sm:top-4 sm:right-4 h-8 w-8 text-muted-foreground hover:text-foreground rounded-full z-10"
                        >
                            <X className="w-5 h-5" />
                        </Button>

                        <CardHeader className="text-center pb-2 sm:pb-4 pt-5 sm:pt-6 px-4 sm:px-6 shrink-0">
                            <div className="mx-auto w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 text-primary border border-primary/20 rounded-2xl flex items-center justify-center mb-2 shadow-xs">
                                <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                            <CardTitle className="text-xl sm:text-2xl font-bold">Find Your Photos</CardTitle>
                            <CardDescription className="text-xs sm:text-sm">
                                Take 1 quick selfie and our smart search will find all your photos from this event in seconds.
                            </CardDescription>
                        </CardHeader>

                        <form onSubmit={handleAISearch} className="flex flex-col flex-1 overflow-y-auto min-h-0">
                            <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6 flex-1">
                                {/* Camera / Upload View Area */}
                                <div className="relative aspect-4/3 max-h-[220px] sm:max-h-[300px] w-full bg-black/90 rounded-2xl overflow-hidden border border-border flex items-center justify-center shadow-inner">
                                    {searchingAI ? (
                                        <div className="flex flex-col items-center justify-center text-center p-6 space-y-4">
                                            <div className="relative">
                                                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin" />
                                                <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-400 absolute inset-0 m-auto animate-pulse" />
                                            </div>
                                            <div>
                                                <h4 className="text-base sm:text-lg font-semibold text-white">Scanning Event Photos...</h4>
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
                                                    trackEvent("camera_permission_denied", { event: slug });
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                onClick={captureSelfie}
                                                className="absolute bottom-3 sm:bottom-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-full px-5 sm:px-6 text-xs sm:text-sm shadow-xl border border-white/20"
                                            >
                                                <Camera className="w-4 h-4 mr-1.5 sm:mr-2" /> Take Photo
                                            </Button>
                                        </div>
                                    ) : (
                                        <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-neutral-900 transition-colors p-4 sm:p-6 text-center">
                                            <Upload className="w-8 h-8 sm:w-10 sm:h-10 text-neutral-400 mb-2" />
                                            <span className="text-xs sm:text-sm font-medium text-white">Click to upload a selfie photo</span>
                                            <span className="text-[11px] text-neutral-500 mt-0.5">JPG, PNG or WEBP</span>
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
                                            onClick={() => {
                                                const nextMode = !useWebcam;
                                                setUseWebcam(nextMode);
                                                trackEvent("camera_mode_selected", { mode: nextMode ? "live_camera" : "file_upload" });
                                            }}
                                            className="text-xs text-indigo-500 hover:text-indigo-600 font-medium underline underline-offset-4"
                                        >
                                            {useWebcam ? "Or upload a photo from device" : "Or use live camera"}
                                        </button>
                                    </div>
                                )}

                                {/* Guest Name & Email Input */}
                                {!searchingAI && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pt-1">
                                        <div className="space-y-1">
                                            <Label htmlFor="guestName" className="text-xs font-medium">
                                                Your Name *
                                            </Label>
                                            <Input
                                                id="guestName"
                                                placeholder="e.g. Sarah"
                                                value={guestName}
                                                onChange={(e) => setGuestName(e.target.value)}
                                                required
                                                className="h-9 sm:h-10 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="guestEmail" className="text-xs font-medium text-muted-foreground">
                                                Email (Optional)
                                            </Label>
                                            <Input
                                                id="guestEmail"
                                                type="email"
                                                placeholder="sarah@example.com"
                                                value={guestEmail}
                                                onChange={(e) => setGuestEmail(e.target.value)}
                                                className="h-9 sm:h-10 text-sm"
                                            />
                                        </div>
                                    </div>
                                )}
                            </CardContent>

                            {!searchingAI && (
                                <CardFooter className="pt-2 pb-4 sm:pb-6 px-4 sm:px-6 shrink-0">
                                    <Button
                                        type="submit"
                                        disabled={!capturedSelfie || !guestName.trim()}
                                        className="w-full h-10 sm:h-11 bg-indigo-600 hover:bg-indigo-700 font-semibold rounded-xl text-sm"
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
