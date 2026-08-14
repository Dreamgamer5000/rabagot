import { Metadata } from "next";
import EventGalleryClient from "@/components/event-gallery-client";

export const metadata: Metadata = {
    title: "Event Gallery",
};

export default function EventPage() {
    return <EventGalleryClient />;
}
