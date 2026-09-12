// Bandeja — bitácora desplegada, etiquetas por charla y adjuntos. Puerto de
// d-bandeja.html (escritorio: lista + hilo lado a lado) y m-bandeja.html
// (mobile: solo la lista; el hilo vive en /bandeja/charla).

import { ConversationList } from './ConversationList';
import { ChatThread } from './ChatThread';

export default function BandejaPage() {
  return (
    <>
      <div className="hidden flex-1 md:flex">
        <ConversationList variante="desktop" />
        <ChatThread variante="desktop" />
      </div>
      <div className="flex flex-1 md:hidden">
        <ConversationList variante="mobile" />
      </div>
    </>
  );
}
