"use client";
import dynamic from "next/dynamic";
const PageClient = dynamic(() => import("./page-client"), { ssr: false });
export default function PageLoader() { return <PageClient />; }
