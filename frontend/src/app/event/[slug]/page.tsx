import { Metadata } from "next";
import GuestUploadClient from "@/components/guest-upload-client";

export const metadata: Metadata = {
    title: "Join Event",
};

export default function GuestUploadPage() {
    return <GuestUploadClient />;
}
