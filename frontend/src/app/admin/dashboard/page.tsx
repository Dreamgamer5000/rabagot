import { Metadata } from "next";
import AdminDashboardClient from "@/components/admin-dashboard-client";

export const metadata: Metadata = {
    title: "Admin Dashboard",
};

export default function AdminDashboardPage() {
    return <AdminDashboardClient />;
}
