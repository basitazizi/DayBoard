export function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) {
    return {
      greeting: "Good morning",
      detail: "Here's what's ahead today."
    };
  }

  if (hour >= 12 && hour < 17) {
    return {
      greeting: "Good afternoon",
      detail: "Here's what's left today."
    };
  }

  if (hour >= 17 && hour < 22) {
    return {
      greeting: "Good evening",
      detail: "Let's finish the day strong."
    };
  }

  return {
    greeting: "Good night",
    detail: "Here's what tomorrow looks like."
  };
}
