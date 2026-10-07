import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";

// A bottom sheet for phones (the More menu, later filters). react-aria
// handles the focus trap, Escape, tapping the scrim to close, and
// returning focus to whatever opened it.
export function Sheet({
  title,
  isOpen,
  onOpenChange,
  children,
}: {
  title: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 flex items-end bg-scrim"
    >
      <Modal className="w-full rounded-t-sheet bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2">
        <Dialog className="outline-none">
          <div aria-hidden="true" className="mx-auto mt-2.5 mb-1 h-1.5 w-10 rounded-full bg-line" />
          <Heading slot="title" className="px-5 pt-2 pb-1 text-sm font-bold text-ink-3">
            {title}
          </Heading>
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
