import Link from "next/link";

export function ChronicleNav({active}:{active:"chronicle"|"hall"|"achievements"|"gallery"}) {
  const items = [
    { key:"chronicle", href:"/vereinschronik", label:"Chronik" },
    { key:"hall", href:"/vereinschronik/hall-of-fame", label:"Hall of Fame" },
    { key:"achievements", href:"/vereinschronik/erfolge", label:"Vereinserfolge" },
    { key:"gallery", href:"/vereinschronik/galerie", label:"Galerie" },
  ] as const;

  return (
    <nav className="chronicle-tabs" aria-label="Vereinschronik">
      {items.map((item)=>(
        <Link
          key={item.key}
          href={item.href}
          className={active===item.key ? "active" : ""}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
