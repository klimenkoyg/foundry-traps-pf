/* Dice So Nice: результат в карточке — когда 3D-кубики докатились, а не раньше. Без модуля — сразу. */

const dsnActive = () => Boolean(game.modules.get("dice-so-nice")?.active && game.dice3d?.waitFor3DAnimationByMessageID);

/** Дождаться, пока кубики сообщения докатятся (не дольше timeout: вдруг анимацию выключили). */
export async function waitForDice(messageOrId, timeout = 15000) {
  const id = typeof messageOrId === "string" ? messageOrId : messageOrId?.id;
  if (!id || !dsnActive()) return;
  try {
    await Promise.race([game.dice3d.waitFor3DAnimationByMessageID(id), new Promise((resolve) => setTimeout(resolve, timeout))]);
  } catch {
    /* Dice So Nice не нашёл сообщение — не ждём */
  }
}

/**
 * Сообщение с этим броском, которое только что отправил этот пользователь (pf2e создаёт его сам,
 * и в сообщении — уже другой объект броска, поэтому сравниваем формулу и итог). → id или null.
 */
export function rollMessageId(rollOrCheck, withinMs = 30000) {
  // Адаптер pf2e отдаёт { total, natural, degree, roll } — берём сам бросок.
  const roll = rollOrCheck?.roll ?? rollOrCheck;
  if (!roll?.formula) return null;
  const since = Date.now() - withinMs;
  const found = [...(game.messages?.contents ?? [])]
    .reverse()
    .find((m) => m.isAuthor && (m.timestamp ?? 0) >= since && (m.rolls ?? []).some((r) => r.formula === roll.formula && r.total === roll.total));
  return found?.id ?? null;
}
