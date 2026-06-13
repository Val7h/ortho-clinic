import PageLoader from "./page-loader";
export function generateStaticParams() { return [{ token: "_" }]; }
export default function Page() { return <PageLoader />; }
