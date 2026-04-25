export default function JournalBookPage({ params }: { params: { bookId: string } }) {
  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <h1
        className="text-3xl font-bold text-primary mb-2"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Journal
      </h1>
      <p className="text-muted-foreground">
        Entries for book: <span className="text-foreground font-medium">{params.bookId}</span>
      </p>
    </div>
  );
}
