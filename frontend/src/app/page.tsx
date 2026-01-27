import type { Metadata } from "next";
import HomeClient from "@/components/home-client";

export const metadata: Metadata = {
  title: "Home | PICSHARE",
};

export default function HomePage() {
  return <HomeClient />;
}
