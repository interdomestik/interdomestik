import { CircleAlert } from 'lucide-react';

type FlightPriorityNoteProps = Readonly<{
  body: string;
  emergency: string;
  expenses: string;
  title: string;
}>;

export function FlightPriorityNote(props: FlightPriorityNoteProps) {
  return (
    <aside className="mb-6 border-l-4 border-[#8A5500] bg-[#FFF4D6] p-4">
      <div className="flex gap-3">
        <CircleAlert aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-[#8A5500]" />
        <div className="space-y-2 text-base leading-7">
          <h3 className="text-lg font-semibold">{props.title}</h3>
          <p>{props.body}</p>
          <p>{props.expenses}</p>
          <p className="font-semibold">{props.emergency}</p>
        </div>
      </div>
    </aside>
  );
}
