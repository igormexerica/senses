import { redirect } from "next/navigation";

// A home do app é o Comparativo (primeira tela). O shell cresce com novas telas.
export default function Home() {
  redirect("/comparativo");
}
