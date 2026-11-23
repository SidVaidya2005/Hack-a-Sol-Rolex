"use client";

import { useState } from "react";

import { ClaimSimulationProvider } from "../components/ClaimSimulationProvider";
import { ClaimStoryBar } from "../components/ClaimStoryBar";
import { HospitalScreen } from "../components/HospitalScreen";
import { InsurerScreen } from "../components/InsurerScreen";
import { PatientScreen } from "../components/PatientScreen";
import { PublicChainScreen } from "../components/PublicChainScreen";
import { RecordSessionProvider } from "../components/RecordSession";
import { ResponderScreen } from "../components/ResponderScreen";
import { RoleNavigation, type RoleId } from "../components/RoleNavigation";
import { WalletConnection } from "../components/WalletConnection";

export default function Home() {
  const [activeRole, setActiveRole] = useState<RoleId>("patient");
  const selectRole = (role: RoleId) => {
    setActiveRole(role);
    window.scrollTo({ top: 0 });
  };

  return (
    <ClaimSimulationProvider>
      <RecordSessionProvider>
        <div
          className={`page-fade min-h-screen ${activeRole === "public" ? "surface-dark band-navy" : "bg-rado-canvas"}`}
        >
          {/* On phones only the header sticks, because both bars would fill the screen. */}
          <div className="contents lg:sticky lg:top-0 lg:z-20 lg:block lg:bg-rado-canvas">
            <header className="sticky top-0 z-20 border-b border-rado-line bg-rado-canvas lg:static">
              <div className="mx-auto grid max-w-[1280px] grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-8 lg:grid-cols-[1fr_auto_1fr]">
                <p className="page-title text-2xl leading-none tracking-[-0.02em] text-rado-ink">
                  rado
                </p>
                <div className="col-span-2 row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
                  <RoleNavigation activeRole={activeRole} onSelect={selectRole} />
                </div>
                <div className="col-start-2 row-start-1 justify-self-end lg:col-start-3">
                  <WalletConnection />
                </div>
              </div>
            </header>
            <ClaimStoryBar activeRole={activeRole} onGo={selectRole} />
          </div>
          <main className="page-rise mx-auto max-w-[1280px] px-4 py-8 sm:px-8">
            {activeRole === "patient" ? <PatientScreen /> : null}
            {activeRole === "hospital" ? <HospitalScreen /> : null}
            {activeRole === "responder" ? <ResponderScreen /> : null}
            {activeRole === "insurer" ? <InsurerScreen /> : null}
            {activeRole === "public" ? <PublicChainScreen /> : null}
          </main>
        </div>
      </RecordSessionProvider>
    </ClaimSimulationProvider>
  );
}
