import { Metadata } from "next";
import GuestGalleryClient from "@/components/guest-gallery-client";

export const metadata: Metadata = {
    title: "Personal Gallery",
};

export default function GuestGalleryPage() {
    return <GuestGalleryClient />;
}
