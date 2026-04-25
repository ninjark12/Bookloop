export default function BookSearchPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <h1
        className="text-3xl font-bold text-primary mb-2"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Find a book
      </h1>
      <p className="text-muted-foreground mb-8">
        Search for a book to add to your reading list.
      </p>
      <input
        type="text"
        placeholder="Search by title or author..."
        className="w-full border border-border rounded-md px-4 py-3 text-sm
                   bg-background focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
