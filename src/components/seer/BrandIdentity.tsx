import logoAsset from "@/assets/navin-dna-logo.png.asset.json";

export function BrandLogo({ className = "h-12", decorative = false }: { className?: string; decorative?: boolean }) {
  return <img src={logoAsset.url} width={1081} height={1920} className={`w-auto shrink-0 object-contain ${className}`} alt={decorative ? "" : "Claudian Navin Stanislaus — gold DNA helix"} />;
}

export function BasePairingIdentity() {
  return (
    <section className="base-pairing-identity" aria-label="Base Pairing">
      <div className="min-w-0">
        <div className="seer-label text-primary">Base Pairing</div>
        <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">SEER.ai</h1>
        <p className="mt-3 text-lg text-foreground">Second mind. Symbiote.</p>
        <p className="mt-1 text-sm text-muted-foreground">Strategic Judgement Engine</p>
        <div className="mt-7 border-l-2 border-primary pl-4">
          <p className="text-sm font-medium">Claudian Navin Stanislaus</p>
          <p className="mt-1 text-xs text-muted-foreground">Independent Strategic Advisor · Fractional Marketing Leader</p>
        </div>
      </div>
      <BrandLogo className="h-44 sm:h-56" />
      <div className="brand-pairing-line col-span-full">
        <span>Business</span><span className="brand-bond" aria-hidden="true" />
        <span className="text-center text-primary">Judgement</span><span className="brand-bond" aria-hidden="true" /><span className="text-right">Consumer</span>
      </div>
    </section>
  );
}