import type { ChatModelAdapter } from "@assistant-ui/react";
import { api } from "../../services/api";

export const createMapleAssistantAdapter = (): ChatModelAdapter => {
  return {
    run: async ({ messages }) => {
      // Obtenemos el último mensaje del usuario
      const lastMessage = messages[messages.length - 1];
      
      let userMsg = "";
      if (lastMessage?.content && Array.isArray(lastMessage.content)) {
        const textPart = lastMessage.content.find((p: any) => p.type === "text");
        if (textPart) userMsg = textPart.text;
      }

      if (!userMsg) {
        throw new Error("No text content found in the last message");
      }

      try {
        // Usamos la API existente de MapleVault para enviar el mensaje
        const response = await api.sendChatMessage(userMsg);
        
        // Si hay una acción que requiere UI (tarjeta o botón de confirmación), 
        // llamamos al callback para manejarlo externamente o directamente devolvemos un tool call
        // Pero assistant-ui permite devolver el contenido text, y para actions lo manejaremos 
        // a través del estado o como texto especial.
        
        // Por ahora, para simplificar sin Vercel AI SDK tools:
        // si hay visualData o action, podemos pasarlo como metadata (assistant-ui annotations/attachments)
        // o manejarlo inyectando un componente especial. 
        // assistant-ui recomienda usar `unstable_annotations` o crear Custom Tools.
        
        const contentParts: any[] = [];
        
        if (response.text) {
          contentParts.push({ type: "text", text: response.text });
        }
        
        // Custom UI tool call simulation if we have an action
        if (response.action) {
           contentParts.push({
             type: "tool-call",
             toolName: "maple_action",
             toolCallId: `call_${Date.now()}`,
             args: response.action
           });
        }
        
        // Custom UI simulation for visualData
        if (response.visualData) {
           contentParts.push({
             type: "tool-call",
             toolName: "maple_visual",
             toolCallId: `viz_${Date.now()}`,
             args: response.visualData
           });
        }

        return {
          content: contentParts,
        };
      } catch (err: any) {
        throw new Error(err.message || "Error communicating with Maple Assistant");
      }
    },
  };
};
