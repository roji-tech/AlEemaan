// Universal School Calculator — Pure Mathematical Engine
// Uses Dijkstra's Shunting-Yard algorithm to tokenize and evaluate mathematical expressions.
// 100% compliant with strict CSP (No eval(), No Function(), No dynamic code execution).

export interface CalculationResult {
  expression: string;
  result: number;
  formatted: string;
  timestamp: number;
}

const OPERATOR_PRECEDENCE: Record<string, number> = {
  "+": 1,
  "-": 1,
  "−": 1,
  "*": 2,
  "×": 2,
  "/": 2,
  "÷": 2,
  "%": 3,
};

function normalizeOperator(op: string): string {
  if (op === "×") return "*";
  if (op === "÷") return "/";
  if (op === "−") return "-";
  return op;
}

export function tokenize(expr: string): string[] | null {
  const tokens: string[] = [];
  let i = 0;
  const clean = expr.trim();

  while (i < clean.length) {
    const char = clean[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (/\d/.test(char) || char === ".") {
      let num = "";
      while (i < clean.length && /[\d.]/.test(clean[i])) {
        num += clean[i];
        i++;
      }
      if ((num.match(/\./g) || []).length > 1) {
        return null;
      }
      tokens.push(num);
      continue;
    }

    if (char in OPERATOR_PRECEDENCE || char === "(" || char === ")") {
      tokens.push(char);
      i++;
      continue;
    }

    return null;
  }

  return tokens;
}

export function evaluateArithmetic(expr: string): number | null {
  const tokens = tokenize(expr);
  if (!tokens || tokens.length === 0) return null;

  const outputQueue: string[] = [];
  const operatorStack: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (!isNaN(Number(token))) {
      outputQueue.push(token);
    } else if (token === "%") {
      outputQueue.push("%");
    } else if (token === "(") {
      operatorStack.push(token);
    } else if (token === ")") {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== "(") {
        outputQueue.push(operatorStack.pop()!);
      }
      if (operatorStack.length === 0 || operatorStack[operatorStack.length - 1] !== "(") {
        return null;
      }
      operatorStack.pop();
    } else if (token in OPERATOR_PRECEDENCE) {
      const currentOp = normalizeOperator(token);
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== "(") {
        const topOp = normalizeOperator(operatorStack[operatorStack.length - 1]);
        if (OPERATOR_PRECEDENCE[topOp] >= OPERATOR_PRECEDENCE[currentOp]) {
          outputQueue.push(operatorStack.pop()!);
        } else {
          break;
        }
      }
      operatorStack.push(token);
    } else {
      return null;
    }
  }

  while (operatorStack.length > 0) {
    const op = operatorStack.pop()!;
    if (op === "(" || op === ")") return null;
    outputQueue.push(op);
  }

  const evalStack: number[] = [];

  for (const token of outputQueue) {
    if (!isNaN(Number(token))) {
      evalStack.push(Number(token));
    } else if (token === "%") {
      if (evalStack.length < 1) return null;
      const val = evalStack.pop()!;
      evalStack.push(val / 100);
    } else {
      if (evalStack.length < 2) return null;
      const b = evalStack.pop()!;
      const a = evalStack.pop()!;
      const op = normalizeOperator(token);

      switch (op) {
        case "+":
          evalStack.push(a + b);
          break;
        case "-":
          evalStack.push(a - b);
          break;
        case "*":
          evalStack.push(a * b);
          break;
        case "/":
          if (b === 0) return null;
          evalStack.push(a / b);
          break;
        default:
          return null;
      }
    }
  }

  if (evalStack.length !== 1) return null;
  const result = evalStack[0];
  return isFinite(result) ? result : null;
}

export function formatCalculation(num: number): string {
  if (!isFinite(num)) return "0";
  const parts = num.toString().split(".");
  const integerPart = Number(parts[0]).toLocaleString();
  if (parts.length > 1) {
    const decimals = parts[1].slice(0, 4);
    return `${integerPart}.${decimals}`;
  }
  return integerPart;
}

export function applyDiscountWaiver(baseAmount: number, discountPercent: number): number {
  if (discountPercent <= 0 || discountPercent > 100) return baseAmount;
  const discounted = baseAmount * (1 - discountPercent / 100);
  return Math.round(discounted * 100) / 100;
}

export function applyTaxSurcharge(baseAmount: number, taxPercent: number): number {
  if (taxPercent <= 0) return baseAmount;
  const total = baseAmount * (1 + taxPercent / 100);
  return Math.round(total * 100) / 100;
}
