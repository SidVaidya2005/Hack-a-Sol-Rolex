"use client";

import type { ReactNode } from "react";
import { useState, useSyncExternalStore } from "react";

import { AccountEntry, ProfileSetup, RoleSetup, useAccountRole } from "../components/AccountEntry";
import { ClaimExchangeProvider } from "../components/ClaimExchangeProvider";
import { ClaimSimulationProvider } from "../components/ClaimSimulationProvider";
import { ClaimStoryBar } from "../components/ClaimStoryBar";
import { HospitalScreen } from "../components/HospitalScreen";
import { InsurerScreen } from "../components/InsurerScreen";
import { HospitalWorkspace, PatientWorkspace } from "../components/LiveWorkspaces";
import { PatientScreen } from "../components/PatientScreen";
import { ProviderScreen } from "../components/ProviderScreen";
import { PublicChainScreen } from "../components/PublicChainScreen";
import { RecordSessionProvider, useRecordSession } from "../components/RecordSession";
import { ResponderScreen } from "../components/ResponderScreen";
import { RoleNavigation, type RoleId } from "../components/RoleNavigation";
import { WalletConnection } from "../components/WalletConnection";
import type { AccountRole } from "../lib/account-role";

export default function Home() {
  return (
    <ClaimSimulationProvider>
      <RecordSessionProvider>
        <ClaimExchangeProvider>
          <AppEntry />
        </ClaimExchangeProvider>
      </RecordSessionProvider>
    </ClaimSimulationProvider>
  );
}

const noSubscription = () => () => undefined;

function AppEntry() {
  const { session } = useRecordSession();
  const [publicView, setPublicView] = useState(false);
  const walkthrough = useSyncExternalStore(
    noSubscription,
    () => new URLSearchParams(window.location.search).has("walkthrough"),
    () => false,
  );

  if (walkthrough) {
    return <DemoApp initialRole="patient" onExit={() => window.location.replace("/")} />;
  }
  if (publicView) {
    return (
      <AppFrame
        activeRole="public"
        exitLabel="Back to sign in"
        navigation={
          <RoleNavigation activeRole="public" allowed={["public"]} onSelect={() => undefined} />
        }
        onExit={() => setPublicView(false)}
      >
        <PublicChainScreen />
      </AppFrame>
    );
  }
  if (!session) return <AccountEntry onPublicChain={() => setPublicView(true)} />;
  // Keyed by wallet, so one wallet's setup or view never carries over to another.
  return <SignedInApp key={session.address} />;
}

function SignedInApp() {
  const { loading, failed, role, retry, choose } = useAccountRole();
  const [settingUpProfile, setSettingUpProfile] = useState(false);

  if (loading || failed) {
    return (
      <div className="grid min-h-screen place-items-center bg-rado-canvas px-4 text-center">
        {failed ? (
          <div>
            <p className="text-sm text-rado-error" role="alert">
              Could not check this wallet&apos;s role on the chain.
            </p>
            <button className="button-primary mt-4" onClick={retry} type="button">
              Try again
            </button>
          </div>
        ) : (
          <p className="text-sm text-rado-slate" role="status">
            Checking your account…
          </p>
        )}
      </div>
    );
  }
  if (!role) {
    return (
      <RoleSetup
        onChoose={(chosen) => {
          choose(chosen);
          setSettingUpProfile(chosen === "patient");
        }}
      />
    );
  }
  if (settingUpProfile) return <ProfileSetup onDone={() => setSettingUpProfile(false)} />;
  return <RoleWorkspace role={role} />;
}

function RoleWorkspace({ role }: { role: AccountRole }) {
  const [view, setView] = useState<RoleId>(role);
  const select = (next: RoleId) => {
    setView(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <AppFrame
      activeRole={view}
      navigation={<RoleNavigation activeRole={view} allowed={[role, "public"]} onSelect={select} />}
    >
      {view === "public" ? <PublicChainScreen /> : null}
      {view === "patient" ? <PatientWorkspace /> : null}
      {view === "hospital" ? <HospitalWorkspace /> : null}
      {view === "provider" ? <ProviderScreen /> : null}
      {view === "responder" ? <ResponderScreen /> : null}
      {view === "insurer" ? <InsurerScreen /> : null}
    </AppFrame>
  );
}

/** The labeled all-role walkthrough at `/?walkthrough`. Contracts still enforce every action. */
function DemoApp({ initialRole, onExit }: { initialRole: RoleId; onExit: () => void }) {
  const [activeRole, setActiveRole] = useState<RoleId>(initialRole);
  const selectRole = (role: RoleId) => {
    setActiveRole(role);
    window.scrollTo({ top: 0 });
  };

  return (
    <AppFrame
      activeRole={activeRole}
      navigation={<RoleNavigation activeRole={activeRole} onSelect={selectRole} />}
      exitLabel="Exit walkthrough"
      onExit={onExit}
      story={<ClaimStoryBar activeRole={activeRole} onGo={selectRole} />}
    >
      {activeRole === "patient" ? <PatientScreen /> : null}
      {activeRole === "hospital" ? <HospitalScreen /> : null}
      {activeRole === "provider" ? <ProviderScreen /> : null}
      {activeRole === "responder" ? <ResponderScreen /> : null}
      {activeRole === "insurer" ? <InsurerScreen /> : null}
      {activeRole === "public" ? <PublicChainScreen /> : null}
    </AppFrame>
  );
}

function AppFrame({
  activeRole,
  navigation,
  story,
  onExit,
  exitLabel,
  children,
}: {
  activeRole: RoleId;
  navigation: ReactNode;
  story?: ReactNode;
  onExit?: () => void;
  exitLabel?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`page-fade min-h-screen ${activeRole === "public" ? "surface-dark band-navy" : "bg-rado-canvas"}`}
    >
      {/* On phones only the header sticks, because both bars would fill the screen. */}
      <div className="contents lg:sticky lg:top-0 lg:z-20 lg:block lg:bg-rado-canvas">
        <header className="sticky top-0 z-20 border-b border-rado-line bg-rado-canvas lg:static">
          <div className="mx-auto grid max-w-[1280px] grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-8 lg:grid-cols-[1fr_auto_1fr]">
            <p className="page-title text-[24px] leading-none text-rado-ink">Rado</p>
            <div className="col-span-2 row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
              {navigation}
            </div>
            <div className="col-start-2 row-start-1 flex items-center justify-end gap-3 lg:col-start-3">
              {onExit ? (
                <button
                  className="button-secondary whitespace-nowrap"
                  onClick={onExit}
                  type="button"
                >
                  {exitLabel}
                </button>
              ) : null}
              <WalletConnection />
            </div>
          </div>
        </header>
        {story}
      </div>
      <main className="page-rise mx-auto max-w-[1280px] px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
