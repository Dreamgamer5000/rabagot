"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

export interface LightboxPhoto {
    id: string;
    filename: string;
    thumbnail_url?: string;
    original_url: string;
    drive_file_id?: string;
    faces_count?: number;
    created_at?: string;
}

interface PhotoLightboxModalProps {
    photos: LightboxPhoto[];
    currentIndex: number | null;
    onClose: () => void;
    onNavigate: (index: number) => void;
    apiUrl?: string;
}

export default function PhotoLightboxModal({
    photos,
    currentIndex,
    onClose,
    onNavigate,
    apiUrl = process.env.NEXT_PUBLIC_API_URL || "",
}: PhotoLightboxModalProps) {
    const [imageLoading, setImageLoading] = useState(true);
    const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
    const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transformRef = useRef<any>(null);

    const isOpen = currentIndex !== null && currentIndex >= 0 && currentIndex < photos.length;
    const currentPhoto = isOpen ? photos[currentIndex] : null;

    // Reset image loading & zoom when changing photo
    useEffect(() => {
        if (isOpen) {
            setImageLoading(true);
            if (transformRef.current) {
                transformRef.current.resetTransform();
            }
        }
    }, [currentIndex, isOpen]);

    // Handle Keyboard navigation
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (!isOpen) return;

            if (e.key === "Escape") {
                onClose();
            } else if (e.key === "ArrowLeft") {
                if (currentIndex > 0) {
                    onNavigate(currentIndex - 1);
                }
            } else if (e.key === "ArrowRight") {
                if (currentIndex < photos.length - 1) {
                    onNavigate(currentIndex + 1);
                }
            }
        },
        [isOpen, currentIndex, photos.length, onClose, onNavigate]
    );

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    // Lock body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isOpen]);

    // Touch swipe handlers
    const minSwipeDistance = 50;
    const onTouchStartHandler = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart({
            x: e.targetTouches[0].clientX,
            y: e.targetTouches[0].clientY,
        });
    };

    const onTouchMoveHandler = (e: React.TouchEvent) => {
        setTouchEnd({
            x: e.targetTouches[0].clientX,
            y: e.targetTouches[0].clientY,
        });
    };

    const onTouchEndHandler = () => {
        if (!touchStart || !touchEnd || !isOpen) return;
        const distanceX = touchStart.x - touchEnd.x;
        const distanceY = touchStart.y - touchEnd.y;
        const isHorizontalSwipe = Math.abs(distanceX) > Math.abs(distanceY);

        if (isHorizontalSwipe) {
            if (distanceX > minSwipeDistance && currentIndex < photos.length - 1) {
                // Swipe Left -> Next
                onNavigate(currentIndex + 1);
            } else if (distanceX < -minSwipeDistance && currentIndex > 0) {
                // Swipe Right -> Prev
                onNavigate(currentIndex - 1);
            }
        }
    };

    if (!isOpen || !currentPhoto) return null;

    const originalSrc = currentPhoto.original_url.startsWith("http")
        ? currentPhoto.original_url
        : `${apiUrl}${currentPhoto.original_url}`;

    const downloadSrc = `${apiUrl}/photos/download/${currentPhoto.id}`;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md transition-all duration-300 animate-in fade-in"
            onTouchStart={onTouchStartHandler}
            onTouchMove={onTouchMoveHandler}
            onTouchEnd={onTouchEndHandler}
        >
            {/* Top Bar Controls */}
            <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
                <div className="flex items-center gap-3 text-white">
                    <span className="text-sm font-medium bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                        {currentIndex + 1} / {photos.length}
                    </span>
                    <span className="text-sm text-neutral-300 truncate max-w-[200px] sm:max-w-md hidden sm:inline-block">
                        {currentPhoto.filename}
                    </span>
                    {typeof currentPhoto.faces_count === "number" && currentPhoto.faces_count > 0 && (
                        <span className="text-xs bg-indigo-500/30 text-indigo-200 border border-indigo-500/30 px-2 py-0.5 rounded-full hidden md:inline-block">
                            {currentPhoto.faces_count} face{currentPhoto.faces_count !== 1 ? "s" : ""}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Direct Download Button */}
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-9 gap-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/10 backdrop-blur-md shadow-lg"
                        asChild
                    >
                        <a href={downloadSrc} download={currentPhoto.filename}>
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Download</span>
                        </a>
                    </Button>

                    {/* Close Button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10 rounded-full"
                    >
                        <X className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            {/* Navigation Previous Button */}
            {currentIndex > 0 && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onNavigate(currentIndex - 1);
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-50 p-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-md text-white transition-transform hover:scale-105 active:scale-95 shadow-xl"
                    aria-label="Previous Photo"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
            )}

            {/* Navigation Next Button */}
            {currentIndex < photos.length - 1 && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onNavigate(currentIndex + 1);
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-50 p-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-md text-white transition-transform hover:scale-105 active:scale-95 shadow-xl"
                    aria-label="Next Photo"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            )}

            {/* Center Image Container with Zoom & Pan */}
            <div className="relative w-full h-full flex items-center justify-center p-4 sm:p-12">
                {imageLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 z-10">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                        <span className="text-sm font-medium">Loading high-res photo...</span>
                    </div>
                )}

                <TransformWrapper
                    ref={transformRef}
                    initialScale={1}
                    minScale={0.5}
                    maxScale={4}
                    centerOnInit
                    wheel={{ step: 0.1 }}
                >
                    {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                            <TransformComponent
                                wrapperStyle={{ width: "100%", height: "100%" }}
                                contentStyle={{
                                    width: "100%",
                                    height: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={originalSrc}
                                    alt={currentPhoto.filename}
                                    onLoad={() => setImageLoading(false)}
                                    className={`max-w-full max-h-[85vh] object-contain select-none transition-opacity duration-300 rounded-md ${
                                        imageLoading ? "opacity-0" : "opacity-100"
                                    }`}
                                    draggable={false}
                                />
                            </TransformComponent>

                            {/* Floating Zoom Bar (Bottom) */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-2xl">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => zoomIn()}
                                    className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10 rounded-full"
                                    title="Zoom In"
                                >
                                    <ZoomIn className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => zoomOut()}
                                    className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10 rounded-full"
                                    title="Zoom Out"
                                >
                                    <ZoomOut className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => resetTransform()}
                                    className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10 rounded-full"
                                    title="Reset Zoom"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                </Button>
                            </div>
                        </>
                    )}
                </TransformWrapper>
            </div>
        </div>
    );
}
