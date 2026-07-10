export default function StatTile({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-gold-dim bg-card p-4">
      <p className="text-xs text-text3">{label}</p>
      <p className="text-2xl font-bold text-gold-hi">{value}</p>
      {sublabel && <p className="text-[11px] text-text3">{sublabel}</p>}
    </div>
  );
}
