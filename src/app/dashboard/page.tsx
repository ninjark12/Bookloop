import BookCard from "@/components/BookCard";

const mockBooks = [
  { title: "Dune", author: "Frank Herbert", chapter: 12, status: "READING" as const },
  { title: "The Name of the Wind", author: "Patrick Rothfuss", chapter: 42, status: "READING" as const },
  { title: "Educated", author: "Tara Westover", chapter: 30, status: "READ" as const },
  { title: "Piranesi", author: "Susanna Clarke", chapter: 1, status: "TBR" as const },
];

export default function Dashboard() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <h1
        className="text-3xl font-bold text-primary mb-2"
        style={{ fontFamily: "var(--font-display)" }}
      >
        My reading list
      </h1>
      <p className="text-muted-foreground mb-8">Track your books and journal entries.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {mockBooks.map((book) => (
          <BookCard key={book.title} {...book} />
        ))}
      </div>
    </div>
  );
}
