import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const failures=[];
const allowedCss=new Set(["app/panda.css"]);
const forbiddenPackages=[
  "tailwindcss","@tailwindcss/postcss","@tailwindcss/forms","@tailwindcss/typography",
  "shadcn","shadcn-ui","@emotion/react","@emotion/styled","styled-components",
  "@mui/material","@mui/system","chakra-ui","@chakra-ui/react"
];
const forbiddenImportFragments=[
  "tailwindcss","shadcn","@emotion/","styled-components","@mui/","@chakra-ui/"
];

function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(["node_modules",".git",".next","styled-system"].includes(entry.name)) continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) walk(full);
    else {
      const rel=path.relative(root,full).replaceAll("\\","/");
      if(rel.endsWith(".css") && !allowedCss.has(rel)) failures.push(`Nicht erlaubte CSS-Datei: ${rel}`);
      if(rel==="scripts/check-styling.mjs") continue;
      if(/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(rel)){
        const text=fs.readFileSync(full,"utf8");
        if(/<style\s+jsx|styled-jsx/.test(text)) failures.push(`styled-jsx gefunden: ${rel}`);
        for(const fragment of forbiddenImportFragments){
          if(text.includes(fragment)) failures.push(`Nicht erlaubtes Styling-Importfragment "${fragment}" in ${rel}`);
        }
      }
    }
  }
}

const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
const allDeps={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
for(const dep of forbiddenPackages){
  if(dep in allDeps) failures.push(`Nicht erlaubte Styling-Abhängigkeit: ${dep}`);
}

const required=[
  "@ark-ui/react","@rive-app/react-canvas","lucide-react","motion"
];
const requiredDev=["@pandacss/dev","@park-ui/cli"];
for(const dep of required){
  if(!(dep in (pkg.dependencies||{}))) failures.push(`Erforderliche Abhängigkeit fehlt: ${dep}`);
}
for(const dep of requiredDev){
  if(!(dep in (pkg.devDependencies||{}))) failures.push(`Erforderliche Dev-Abhängigkeit fehlt: ${dep}`);
}

walk(root);

if(failures.length){
  console.error("\nVDC Styling Guard fehlgeschlagen:\n");
  for(const failure of [...new Set(failures)]) console.error("- "+failure);
  process.exit(1);
}

console.log("VDC Styling Guard: OK");
console.log("Erlaubte Styling-Basis: Panda CSS + Park UI + Ark UI + VDC Tokens/UI Kit + Lucide + Motion + Rive.");
