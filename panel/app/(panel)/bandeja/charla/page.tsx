// Charla abierta en mobile — m-charla.html. En desktop el hilo ya se ve al
// lado de la lista en /bandeja (no hay pantalla propia), así que si alguien
// entra acá directo desde una compu ve el mismo split que /bandeja.

import { ConversationList } from '../ConversationList';
import { ChatThread } from '../ChatThread';

export default function CharlaMobilePage() {
  return (
    <>
      <div className="hidden flex-1 md:flex">
        <ConversationList variante="desktop" />
        <ChatThread variante="desktop" />
      </div>
      <div className="flex flex-1 md:hidden">
        <ChatThread variante="mobile" />
      </div>
    </>
  );
}
