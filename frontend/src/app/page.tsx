import type { Metadata } from "next";
import HomeClient from "@/components/home-client";

export const metadata: Metadata = {
  title: "Home | Wedding Album",
};

export default function HomePage() {
  return <HomeClient />;
}
