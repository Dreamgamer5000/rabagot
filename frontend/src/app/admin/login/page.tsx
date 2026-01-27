import { Metadata } from "next";
import AdminLoginClient from "@/components/admin-login-client";

export const metadata: Metadata = {
    title: "Admin Login",
};

export default function AdminLoginPage() {
    return <AdminLoginClient />;
}
