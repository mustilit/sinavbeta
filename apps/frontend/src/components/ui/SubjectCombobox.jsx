import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * SubjectCombobox — ders havuzundan arama destekli seçim. value = ders ADI (string).
 * @param {{ value:string, onChange:(name:string)=>void, subjects:Array<{id:string,name:string}>, placeholder?:string, disabled?:boolean }} props
 */
export function SubjectCombobox({ value, onChange, subjects = [], placeholder = "Ders seç", disabled }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full h-10 justify-between font-normal px-3 bg-transparent", !value && "text-muted-foreground")}
        >
          <span className="truncate text-left">{value || placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[260px]">
        <Command>
          <CommandInput placeholder="Ders ara..." className="h-9" />
          <CommandList className="max-h-[260px]">
            <CommandEmpty>Ders bulunamadı. Önce "Dersler" sayfasından ekleyin.</CommandEmpty>
            <CommandGroup>
              {subjects.map((s) => (
                <CommandItem key={s.id} value={s.name} onSelect={() => { onChange(s.name); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === s.name ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{s.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default SubjectCombobox;
