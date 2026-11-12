import { settings } from "../../store";

/** "สวัสดี <ชื่อครู>": the one h1 of the page. Each layout puts it where its head is (the states put it at the top). */
export function Greeting({ class: cls }: { class?: string }) {
  const name = settings.value?.teacher_name || "คุณครู";
  return <h1 class={"hm-greet" + (cls ? " " + cls : "")}>สวัสดี {name}</h1>;
}
