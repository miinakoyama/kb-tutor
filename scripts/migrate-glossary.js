import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const glossaryPath = path.join(__dirname, "../src/data/glossary.json");
const questionsPath = path.join(__dirname, "../src/data/questions.json");

const glossary = JSON.parse(fs.readFileSync(glossaryPath, "utf-8"));
const questions = JSON.parse(fs.readFileSync(questionsPath, "utf-8"));

const glossaryMap = new Map();
for (const term of glossary) {
  glossaryMap.set(term.id, term);
}

const migratedQuestions = questions.map((q) => {
  const newQuestion = { ...q };

  if (q.inlineTermIds && Array.isArray(q.inlineTermIds)) {
    newQuestion.inlineTerms = q.inlineTermIds
      .map((id) => glossaryMap.get(id))
      .filter(Boolean);
    delete newQuestion.inlineTermIds;
  }

  if (q.sidebarTermIds && Array.isArray(q.sidebarTermIds)) {
    newQuestion.sidebarTerms = q.sidebarTermIds
      .map((id) => glossaryMap.get(id))
      .filter(Boolean);
    delete newQuestion.sidebarTermIds;
  }

  return newQuestion;
});

fs.writeFileSync(questionsPath, JSON.stringify(migratedQuestions, null, 2));

console.log(`Migrated ${migratedQuestions.length} questions.`);
console.log("Done!");
