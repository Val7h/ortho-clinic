import PageLoader from "./page-loader";
export function generateStaticParams() { return [{ id: "_" }]; }
export default function Page() { return <PageLoader />; }
