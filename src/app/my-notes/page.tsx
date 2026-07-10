import { redirect } from "next/navigation";

export default function MyNotesPage() {
  redirect("/bookmarks?tab=notes");
}
