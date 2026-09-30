export function PagePlaceholder({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="p-8">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      {children ? <div className="mt-2 text-sm text-text-muted">{children}</div> : null}
    </section>
  );
}
