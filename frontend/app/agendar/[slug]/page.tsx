import PageLoader from "./page-loader";
export function generateStaticParams() { return [{ slug: "_" }]; }
export default function Page() { return <PageLoader />; }
