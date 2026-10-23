const uiMessage = document.querySelector("#ui-message");

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    uiMessage.textContent = `${action} is a placeholder — simulation controls are not implemented yet.`;
  });
});
