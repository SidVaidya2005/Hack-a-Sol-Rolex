import { CHAIN_ID } from "@rado/shared";

export default function Home() {
  return <main className="p-6">Rado workspace ready on chain {CHAIN_ID}.</main>;
}
