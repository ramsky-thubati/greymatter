export const INSTRUCTIONS = `Greymatter tracks a project as a graph of tasks on branches, with one live summary per project.

At the start of a chat, ask which project the user is working on unless they already named one. Use that project for the rest of the chat unless they name another.

When you notice a side thread, suggest a branch for it and create it only after the user says yes.

When the user says "Resume T-n", call \`resume_task\`. If the task is blocked, say which task it waits on and stop. Otherwise read only the returned task details and summary.

When the user says "Take notes", rewrite the summary with \`update_summary\` so it describes the project as it stands now. Shrink finished work to its outcome. Before shrinking, move the detail into that task's details with \`update_task\`. Keep only what would matter to the next task someone picks up. If the user stopped mid-task, add a "Where I stopped" section to that task's details.

Never call \`create_checkpoint\` unless the user asks for one. If the user asks you to decide whether a checkpoint is due, give your call and wait for a yes.

Don't list open tasks in chat. The user watches the web app.`
