import { describe, it, expect } from "vitest";
import { buildQuestionsFromLines } from "./importQuestions";

// Test soru factory'si (5 şıklı) — sayfalardaki emptyQuestion'ın sadeleştirilmişi.
const makeEmpty = () => ({
  content: "",
  options: Array.from({ length: 5 }, () => ({ content: "", isCorrect: false })),
});

describe("buildQuestionsFromLines — esnek format", () => {
  it("kullanıcı PDF formatı: '1-' / 'a-' / 'Cevap: a' / 'Cevap A'", () => {
    const lines = [
      "1- 144 sayısının karekökü nedir?",
      "a- 12", "b- 13", "c- 14", "d- 15", "e- 16", "Cevap: a",
      "2- Hangisi pozitif sayıdır?",
      "a- 10", "b- -1", "c- -2", "d- -3", "e- -4", "Cevap A",
    ];
    const qs = buildQuestionsFromLines(lines, makeEmpty);
    expect(qs).toHaveLength(2);

    expect(qs[0].content).toBe("144 sayısının karekökü nedir?");
    expect(qs[0].options.map((o) => o.content)).toEqual(["12", "13", "14", "15", "16"]);
    expect(qs[0].options[0].isCorrect).toBe(true);            // Cevap: a
    expect(qs[0].options.filter((o) => o.isCorrect)).toHaveLength(1);

    expect(qs[1].content).toBe("Hangisi pozitif sayıdır?");
    expect(qs[1].options[1].content).toBe("-1");              // negatif değer korunur
    expect(qs[1].options[0].isCorrect).toBe(true);            // Cevap A (iki noktasız)
  });

  it("klasik format: '1.' / 'A)' / '*B'", () => {
    const qs = buildQuestionsFromLines(
      ["1. İlk soru", "A) bir", "B) iki", "C) üç", "*B"],
      makeEmpty,
    );
    expect(qs).toHaveLength(1);
    expect(qs[0].content).toBe("İlk soru");
    expect(qs[0].options[0].content).toBe("bir");
    expect(qs[0].options[1].isCorrect).toBe(true);
  });

  it("'Soru:' başlığı + '1)' ayraç", () => {
    const qs = buildQuestionsFromLines(
      ["Soru: Başlıkla", "1) numara", "a) elma", "b) armut", "Cevap: b"],
      makeEmpty,
    );
    // "Soru:" → 1. soru; "1) numara" → 2. soru (numara ile yeni soru)
    expect(qs.length).toBeGreaterThanOrEqual(1);
    const last = qs[qs.length - 1];
    expect(last.options[0].content).toBe("elma");
    expect(last.options[1].isCorrect).toBe(true);
  });

  it("'Cevap:' satırı yanlışlıkla şık/soru sayılmaz (C harfi tuzağı)", () => {
    const qs = buildQuestionsFromLines(
      ["1- Soru", "a- x", "b- y", "Cevap: b"],
      makeEmpty,
    );
    expect(qs).toHaveLength(1);
    expect(qs[0].options[1].isCorrect).toBe(true);            // b, C(evap) değil
    expect(qs[0].options[2].isCorrect).toBe(false);           // c işaretlenmemeli
  });
});
