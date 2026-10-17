"use client";

import { useState } from "react";
import {
  evaluateArithmetic,
  formatCalculation,
  applyDiscountWaiver,
  applyTaxSurcharge,
  type CalculationResult,
} from "@/lib/tools/calculator";
import { CopyIcon } from "@/components/ui/icons";

export function CalculatorTool() {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState<number | null>(null);
  const [history, setHistory] = useState<CalculationResult[]>([]);
  const [copied, setCopied] = useState(false);

  const handleInput = (char: string) => {
    setExpression((prev) => prev + char);
  };

  const handleClear = () => {
    setExpression("");
    setResult(null);
  };

  const handleEvaluate = () => {
    if (!expression.trim()) return;
    const evaluated = evaluateArithmetic(expression);
    if (evaluated !== null) {
      setResult(evaluated);
      setHistory((prev) => [
        {
          expression,
          result: evaluated,
          formatted: formatCalculation(evaluated),
          timestamp: Date.now(),
        },
        ...prev.slice(0, 9),
      ]);
    }
  };

  const handleApplyDiscount = (percent: number) => {
    const base = result !== null ? result : evaluateArithmetic(expression);
    if (base !== null && base > 0) {
      const discounted = applyDiscountWaiver(base, percent);
      setExpression(`${base} − ${percent}%`);
      setResult(discounted);
    }
  };

  const handleApplyTax = (percent: number) => {
    const base = result !== null ? result : evaluateArithmetic(expression);
    if (base !== null && base > 0) {
      const taxed = applyTaxSurcharge(base, percent);
      setExpression(`${base} + ${percent}%`);
      setResult(taxed);
    }
  };

  const handleCopy = async () => {
    const textToCopy = result !== null ? result.toString() : expression;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="space-y-4">
      {/* Display Screen */}
      <div className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-inner">
        <div className="min-h-6 overflow-x-auto text-right font-mono text-xs text-fg-muted">{expression || "0"}</div>
        <div className="mt-1 flex items-center justify-between">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-fg hover:bg-line transition-colors"
            title="Copy result to clipboard"
          >
            <CopyIcon className="h-3 w-3" />
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          <div data-testid="calculator-result" className="font-mono text-2xl font-bold tracking-tight text-fg">
            {result !== null ? formatCalculation(result) : "0"}
          </div>
        </div>
      </div>

      {/* School Fee Presets */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <span className="shrink-0 text-[11px] font-medium text-fg-muted">Fee Helpers:</span>
        <button
          type="button"
          onClick={() => handleApplyDiscount(5)}
          className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-semibold text-fg hover:bg-surface-2 transition-colors"
        >
          −5% Sibling
        </button>
        <button
          type="button"
          onClick={() => handleApplyDiscount(10)}
          className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-semibold text-fg hover:bg-surface-2 transition-colors"
        >
          −10% Staff
        </button>
        <button
          type="button"
          onClick={() => handleApplyTax(7.5)}
          className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-semibold text-fg hover:bg-surface-2 transition-colors"
        >
          +7.5% VAT
        </button>
      </div>

      {/* Keypad Grid */}
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="rounded-xl bg-amber-500/10 py-3 text-sm font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 active:scale-95 transition-all"
        >
          C
        </button>
        <button
          type="button"
          onClick={() => handleInput("(")}
          className="rounded-xl bg-surface-2 py-3 text-sm font-semibold text-fg hover:bg-line active:scale-95 transition-all"
        >
          (
        </button>
        <button
          type="button"
          onClick={() => handleInput(")")}
          className="rounded-xl bg-surface-2 py-3 text-sm font-semibold text-fg hover:bg-line active:scale-95 transition-all"
        >
          )
        </button>
        <button
          type="button"
          onClick={() => handleInput(" ÷ ")}
          className="rounded-xl bg-brand/10 py-3 text-base font-bold text-brand hover:bg-brand/20 active:scale-95 transition-all"
        >
          ÷
        </button>

        {["7", "8", "9"].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => handleInput(n)}
            className="rounded-xl border border-line bg-surface py-3 text-sm font-bold text-fg hover:bg-surface-2 active:scale-95 transition-all"
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => handleInput(" × ")}
          className="rounded-xl bg-brand/10 py-3 text-base font-bold text-brand hover:bg-brand/20 active:scale-95 transition-all"
        >
          ×
        </button>

        {["4", "5", "6"].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => handleInput(n)}
            className="rounded-xl border border-line bg-surface py-3 text-sm font-bold text-fg hover:bg-surface-2 active:scale-95 transition-all"
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => handleInput(" − ")}
          className="rounded-xl bg-brand/10 py-3 text-base font-bold text-brand hover:bg-brand/20 active:scale-95 transition-all"
        >
          −
        </button>

        {["1", "2", "3"].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => handleInput(n)}
            className="rounded-xl border border-line bg-surface py-3 text-sm font-bold text-fg hover:bg-surface-2 active:scale-95 transition-all"
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => handleInput(" + ")}
          className="rounded-xl bg-brand/10 py-3 text-base font-bold text-brand hover:bg-brand/20 active:scale-95 transition-all"
        >
          +
        </button>

        <button
          type="button"
          onClick={() => handleInput("0")}
          className="rounded-xl border border-line bg-surface py-3 text-sm font-bold text-fg hover:bg-surface-2 active:scale-95 transition-all"
        >
          0
        </button>
        <button
          type="button"
          onClick={() => handleInput(".")}
          className="rounded-xl border border-line bg-surface py-3 text-sm font-bold text-fg hover:bg-surface-2 active:scale-95 transition-all"
        >
          .
        </button>
        <button
          type="button"
          onClick={() => handleInput("%")}
          className="rounded-xl bg-surface-2 py-3 text-sm font-semibold text-fg hover:bg-line active:scale-95 transition-all"
        >
          %
        </button>
        <button
          type="button"
          onClick={handleEvaluate}
          className="rounded-xl bg-brand py-3 text-base font-bold text-white shadow-md shadow-brand/20 hover:bg-brand/90 active:scale-95 transition-all"
        >
          =
        </button>
      </div>

      {/* History Tape */}
      {history.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-[11px] font-semibold text-fg-muted mb-1.5">Recent Calculations</p>
          <div className="max-h-24 space-y-1 overflow-y-auto">
            {history.slice(0, 3).map((item) => (
              <button
                key={item.timestamp}
                type="button"
                onClick={() => {
                  setExpression(item.result.toString());
                  setResult(item.result);
                }}
                className="flex w-full items-center justify-between rounded-lg p-1 text-left font-mono text-[11px] text-fg hover:bg-surface-2 transition-colors"
              >
                <span className="text-fg-muted">{item.expression}</span>
                <span className="font-bold">{item.formatted}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
