"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Archive, ArrowLeft, ChevronLeft, ChevronRight, Download, Image as ImageIcon, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Photo {
    id: string;
    filename: string;
    thumbnail_url: string;
    original_url: string;
    drive_file_id: string;
}

interface GuestData {
    guest_name: string;
    match_count: number;
    photos: Photo[];
    total_pages: number;
}

export default function GuestGalleryClient() {
    const params = useParams();
    const router = useRouter();
    const guestId = params.guestId as string;

    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [data, setData] = useState<GuestData | null>(null);
    const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
    const [page, setPage] = useState(1);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [downloadingZip, setDownloadingZip] = useState(false);

    const API_URL = process.env.NEXT_PUBLIC_API_URL;

    const fetchMatches = useCallback(async (pageNum: number) => {
        try {
            if (pageNum === 1) setLoading(true);
            else setLoadingMore(true);

            const res = await fetch(`${API_URL}/guests/${guestId}/matches?page=${pageNum}&limit=50`);
            if (!res.ok) throw new Error("Failed to load your gallery.");
            const result = await res.json();

            setData(result);
            if (pageNum === 1) {
                setAllPhotos(result.photos);
            } else {
                setAllPhotos(prev => [...prev, ...result.photos]);
            }
        } catch (error) {
            toast.error("Could not load your photos. Please try again.");
            console.error(error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [guestId, API_URL]);

    useEffect(() => {
        if (guestId) fetchMatches(1);
    }, [guestId, fetchMatches]);

    useEffect(() => {
        if (previewIndex !== null) {
            setPreviewLoading(true);
        }
    }, [previewIndex]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (previewIndex === null || allPhotos.length === 0) return;

            if (e.key === "ArrowRight") {
                setPreviewIndex((prev) => (prev !== null && prev < allPhotos.length - 1 ? prev + 1 : prev));
            } else if (e.key === "ArrowLeft") {
                setPreviewIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
            } else if (e.key === "Escape") {
                setPreviewIndex(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [previewIndex, allPhotos]);

    const handleDownloadAll = async () => {
        if (!data || data.match_count === 0) return;

        setDownloadingZip(true);
        toast.info(`Creating a ZIP with ${data.match_count} photos. This might take a minute...`, {
            duration: 5000
        });

        try {
            const res = await fetch(`${API_URL}/guests/${guestId}/download-zip`);
            if (!res.ok) throw new Error("ZIP creation failed");

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${data.guest_name}_all_photos.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success("Download started!");
        } catch (error) {
            console.error("ZIP Download error:", error);
            toast.error("Failed to create ZIP file. Please try downloading individual photos.");
        } finally {
            setDownloadingZip(false);
        }
    };

    const loadMore = () => {
        if (!data || page >= data.total_pages) return;
        const nextPage = page + 1;
        setPage(nextPage);
        fetchMatches(nextPage);
    };

    const handleDownload = async (photoId: string, filename: string) => {
        toast.info("Preparing download...");
        try {
            const res = await fetch(`${API_URL}/photos/download/${photoId}`);
            if (!res.ok) throw new Error("Download failed");

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename || `photo-${photoId}.jpg`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error("Download error:", error);
            toast.error("Failed to download photo.");
        }
    };

    const currentPreviewPhoto = previewIndex !== null ? allPhotos[previewIndex] : null;

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
                <p className="text-muted-foreground font-medium animate-pulse">Assembling your personal gallery...</p>
            </div>
        );
    }

    if (!data || allPhotos.length === 0) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
                <Card className="max-w-md w-full text-center p-8 border border-border shadow-xl bg-card">
                    <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                        <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-2xl font-bold mb-2">No Photos Found Yet</h3>
                    <p className="text-muted-foreground mb-6">
                        We haven&apos;t found any matches for your selfie in this event.
                        If photos were just uploaded, please check back in a few minutes!
                    </p>
                    <Button onClick={() => router.back()} variant="outline" className="w-full">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Event
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
            {/* Gallery Header */}
            <header className="sticky top-0 z-30 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-6xl">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.back()}
                            className="gap-2 text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            <span className="hidden sm:inline">Back</span>
                        </Button>
                        <div className="h-6 w-px bg-border hidden sm:block" />
                        <div>
                            <h2 className="font-bold text-foreground leading-none">{data.guest_name}&apos;s Gallery</h2>
                            <p className="text-[11px] text-muted-foreground mt-1">{data.match_count} photos matched</p>
                        </div>
                    </div>

                    <Button
                        variant="default"
                        size="sm"
                        onClick={handleDownloadAll}
                        disabled={downloadingZip || data.match_count === 0}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-lg shadow-indigo-100 dark:shadow-none font-bold"
                    >
                        {downloadingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                        <span className="hidden sm:inline">Download All (ZIP)</span>
                        <span className="sm:hidden">ZIP</span>
                    </Button>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8 max-w-6xl">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                    {allPhotos.map((photo, index) => (
                        <Card
                            key={`${photo.id}-${index}`}
                            className="group relative overflow-hidden border-none shadow-md hover:shadow-2xl transition-all duration-300 bg-card cursor-zoom-in"
                            onClick={() => setPreviewIndex(index)}
                        >
                            <CardContent className="p-0 aspect-[3/4] overflow-hidden bg-muted">
                                <Image
                                    src={`${API_URL}${photo.thumbnail_url}`}
                                    alt={photo.filename}
                                    fill
                                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                                    unoptimized
                                    sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
                                />

                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-[10px] text-white/80 truncate font-medium">
                                            {photo.filename}
                                        </p>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDownload(photo.id, photo.filename);
                                            }}
                                            className="bg-white text-slate-900 p-2 rounded-full hover:bg-indigo-600 hover:text-white transition-colors shadow-lg"
                                            title="Download Original"
                                        >
                                            <Download className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Load More */}
                {data && page < data.total_pages && (
                    <div className="mt-12 flex justify-center">
                        <Button
                            variant="outline"
                            size="lg"
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="min-w-[200px] h-12 rounded-xl border-border text-muted-foreground font-bold hover:bg-accent transition-all"
                        >
                            {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            {loadingMore ? "Loading more..." : "Load More Photos"}
                        </Button>
                    </div>
                )}
            </main>

            {/* Lightbox Preview */}
            {previewIndex !== null && currentPreviewPhoto && (
                <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
                    {/* Header Area */}
                    <div className="flex items-center justify-between p-4 md:p-6 z-10">
                        <div className="text-foreground">
                            <p className="font-bold text-lg md:text-xl truncate max-w-[200px] md:max-w-md">
                                {currentPreviewPhoto.filename}
                            </p>
                            <p className="text-muted-foreground text-sm">
                                {previewIndex + 1} of {allPhotos.length}
                            </p>
                        </div>
                        <div className="flex gap-2 md:gap-4">
                            <button
                                onClick={() => handleDownload(currentPreviewPhoto.id, currentPreviewPhoto.filename)}
                                className="bg-accent/10 hover:bg-accent/20 text-foreground p-3 rounded-full transition-colors flex items-center gap-2"
                                title="Download"
                            >
                                <Download className="w-5 h-5" />
                                <span className="hidden md:inline text-sm font-semibold">Download Original</span>
                            </button>
                            <button
                                onClick={() => setPreviewIndex(null)}
                                className="bg-accent/10 hover:bg-accent/20 text-foreground p-3 rounded-full transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    {/* Main Image View */}
                    <div className="flex-1 relative flex items-center justify-center p-4">
                        <button
                            onClick={() => setPreviewIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev))}
                            disabled={previewIndex === 0}
                            className={`absolute left-4 md:left-8 z-10 p-3 rounded-full bg-accent/5 text-foreground transition-all hover:bg-accent/15 disabled:opacity-0 disabled:cursor-default`}
                        >
                            <ChevronLeft className="w-8 h-8 md:w-10 md:h-10" />
                        </button>

                        <div className="relative w-full h-full max-w-5xl max-h-[80vh]">
                            {previewLoading && (
                                <div className="absolute inset-0 flex items-center justify-center z-10">
                                    <Loader2 className="w-12 h-12 animate-spin text-muted-foreground/50" />
                                </div>
                            )}
                            <Image
                                src={`${API_URL}${currentPreviewPhoto.original_url}`}
                                alt={currentPreviewPhoto.filename}
                                fill
                                className={`object-contain transition-all duration-500 ${previewLoading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
                                unoptimized
                                priority
                                onLoad={() => setPreviewLoading(false)}
                            />
                        </div>

                        <button
                            onClick={() => setPreviewIndex((prev) => (prev !== null && prev < allPhotos.length - 1 ? prev + 1 : prev))}
                            disabled={previewIndex === allPhotos.length - 1}
                            className={`absolute right-4 md:right-8 z-10 p-3 rounded-full bg-accent/5 text-foreground transition-all hover:bg-accent/15 disabled:opacity-0 disabled:cursor-default`}
                        >
                            <ChevronRight className="w-8 h-8 md:w-10 md:h-10" />
                        </button>
                    </div>

                    {/* Thumbnail Strip (Desktop) */}
                    <div className="h-24 bg-background/40 p-4 border-t border-border/5 hidden md:flex items-center justify-center gap-4 overflow-x-auto scrollbar-hide">
                        {allPhotos.map((photo, i) => (
                            <button
                                key={`${photo.id}-strip-${i}`}
                                onClick={() => setPreviewIndex(i)}
                                className={`relative h-16 aspect-[3/4] rounded-md overflow-hidden transition-all duration-300 flex-shrink-0 ${i === previewIndex ? "ring-2 ring-indigo-500 scale-110 z-10 opacity-100" : "opacity-40 hover:opacity-80"
                                    }`}
                            >
                                <Image
                                    src={`${API_URL}${photo.thumbnail_url}`}
                                    alt={photo.filename}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                    sizes="80px"
                                />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <footer className="mt-16 text-center border-t border-border pt-8 pb-12">
                <p className="text-muted-foreground text-sm">
                    Sharing is caring! Tell your friends to find their photos too.
                </p>
            </footer>
        </div>
    );
}
