import { useState, useEffect, useRef } from "react";
import { KeyBox } from "@/components/ui/KeyBox";
import { validateCustomDate, parseCustomDate } from "@/utils/dateUtils";

interface CustomDateRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (range: { start: Date; end: Date }) => void;
}

export function CustomDateRangeModal({
  isOpen,
  onClose,
  onSubmit,
}: CustomDateRangeModalProps) {
  const [customDateStep, setCustomDateStep] = useState<"startDate" | "endDate">("startDate");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [customDateError, setCustomDateError] = useState<string>("");

  const startDateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);

  const handleCustomDateSubmit = () => {
    setCustomDateError("");
    
    if (!validateCustomDate(customStartDate)) {
      setCustomDateError("Invalid start date format");
      return;
    }
    
    if (!validateCustomDate(customEndDate)) {
      setCustomDateError("Invalid end date format");
      return;
    }

    const start = parseCustomDate(customStartDate);
    const end = parseCustomDate(customEndDate);
    
    if (!start || !end) {
      setCustomDateError("Invalid date format");
      return;
    }

    // Check if end date is before start date
    if (end < start) {
      setCustomDateError("End date must be after start date");
      return;
    }

    // Set end to end of day (23:59:59)
    end.setHours(23, 59, 59, 999);
    
    onSubmit({ start, end });
    resetModal();
  };

  const handleCustomDateCancel = () => {
    onClose();
    resetModal();
  };

  const handleStartDateSubmit = () => {
    if (validateCustomDate(customStartDate)) {
      setCustomDateError("");
      setCustomDateStep("endDate");
    } else {
      setCustomDateError("Invalid date format");
    }
  };

  const resetModal = () => {
    setCustomStartDate("");
    setCustomEndDate("");
    setCustomDateError("");
    setCustomDateStep("startDate");
  };

  // Auto-format date input
  const formatDateInput = (value: string) => {
    // Remove any non-digit characters
    let digits = value.replace(/\D/g, '');
    
    // Limit to 8 digits (DDMMYYYY)
    if (digits.length > 8) {
      digits = digits.slice(0, 8);
    }
    
    // Add slashes at right positions
    if (digits.length >= 2) {
      digits = digits.slice(0, 2) + '/' + digits.slice(2);
    }
    if (digits.length >= 5) {
      digits = digits.slice(0, 5) + '/' + digits.slice(5);
    }
    
    return digits;
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDateInput(e.target.value);
    setCustomStartDate(formatted);
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDateInput(e.target.value);
    setCustomEndDate(formatted);
  };

  const handleStartDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && customStartDate.length > 0) {
      // Special handling for backspace at slash positions
      const cursorPos = (e.target as HTMLInputElement).selectionStart || 0;
      if (cursorPos > 0 && customStartDate[cursorPos - 1] === '/') {
        // Prevent default and manually handle backspace to remove the digit before slash
        e.preventDefault();
        const newValue = customStartDate.slice(0, cursorPos - 2) + customStartDate.slice(cursorPos);
        const formatted = formatDateInput(newValue);
        setCustomStartDate(formatted);
        // Set cursor position after update
        setTimeout(() => {
          const newCursorPos = Math.max(0, cursorPos - 1);
          (e.target as HTMLInputElement).setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
      }
    }
  };

  const handleEndDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && customEndDate.length > 0) {
      const cursorPos = (e.target as HTMLInputElement).selectionStart || 0;
      if (cursorPos > 0 && customEndDate[cursorPos - 1] === '/') {
        e.preventDefault();
        const newValue = customEndDate.slice(0, cursorPos - 2) + customEndDate.slice(cursorPos);
        const formatted = formatDateInput(newValue);
        setCustomEndDate(formatted);
        setTimeout(() => {
          const newCursorPos = Math.max(0, cursorPos - 1);
          (e.target as HTMLInputElement).setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
      }
    }
  };

  // Auto-focus input when modal opens or step changes
  useEffect(() => {
    if (isOpen && customDateStep === "startDate" && startDateInputRef.current) {
      startDateInputRef.current.focus();
    }
    if (isOpen && customDateStep === "endDate" && endDateInputRef.current) {
      endDateInputRef.current.focus();
    }
  }, [isOpen, customDateStep]);

  // Handle keyboard navigation for custom date modal
  const handleCustomModalKeyDown = (event: KeyboardEvent) => {
    if (!isOpen) return;

    if (event.key === "Escape") {
      handleCustomDateCancel();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (customDateStep === "startDate") {
      if (event.key === "Enter") {
        handleStartDateSubmit();
        event.preventDefault();
        event.stopPropagation();
      }
    } else if (customDateStep === "endDate") {
      if (event.key === "Enter") {
        handleCustomDateSubmit();
        event.preventDefault();
        event.stopPropagation();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        // Only handle backspace for navigation when not typing in input
        if (document.activeElement?.tagName !== "INPUT") {
          setCustomDateStep("startDate");
          event.preventDefault();
          event.stopPropagation();
        }
      } else if (event.key === "Tab") {
        handleTodaysDate();
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  const handleTodaysDate = () => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0'); // JavaScript months are 0-indexed
    const year = today.getFullYear();
    const formattedDate = `${day}/${month}/${year}`;
    setCustomEndDate(formattedDate);
    setCustomDateError("");
  };

  useEffect(() => {
    window.addEventListener("keydown", handleCustomModalKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleCustomModalKeyDown, true);
    };
  }, [isOpen, customDateStep, customStartDate, customEndDate, handleCustomDateSubmit, handleStartDateSubmit, handleCustomDateCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-white shadow-xl p-8 w-96">
        {/* Start Date Step */}
        {customDateStep === "startDate" && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-700">Start Date</div>
              <div className="flex items-center gap-2 text-sm font-light text-gray-600 opacity-0 pointer-events-none">
                <KeyBox className="w-12 h-6 px-2 py-1" hovered={false}>tab</KeyBox>
                <span>Today</span>
              </div>
            </div>
            <input
              ref={startDateInputRef}
              type="text"
              value={customStartDate}
              onChange={handleStartDateChange}
              onKeyDown={handleStartDateKeyDown}
              placeholder="DD/MM/YYYY"
              className="w-full text-3xl font-semibold focus:outline-none placeholder-gray-400"
              maxLength={10}
            />
            {/* Error banner with fixed height */}
            <div className="mt-6 h-12">
              {customDateError && (
                <div className="bg-red-50 text-red-800 px-4 py-3 text-sm">
                  {customDateError}
                </div>
              )}
            </div>

            <div className="flex gap-4 mt-4">
              <div className="flex-1 flex flex-col items-start gap-2">
                <KeyBox className="w-12 h-6 py-1" hovered={false}>esc</KeyBox>
                <button
                  onClick={handleCustomDateCancel}
                  className="w-full bg-transparent border border-black text-black px-6 py-3 text-base font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
              <div className="flex-1 flex flex-col items-start gap-2">
                <KeyBox className="w-16 h-6 px-2 py-1" hovered={false}>return</KeyBox>
                <button
                  onClick={handleStartDateSubmit}
                  className="w-full bg-transparent border border-black text-black px-6 py-3 text-base font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* End Date Step */}
        {customDateStep === "endDate" && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-700">End Date</div>
              <button
                onClick={handleTodaysDate}
                className="flex items-center gap-2 text-sm font-light text-gray-600 hover:text-gray-800 transition-colors"
              >
                <KeyBox className="w-12 h-6 px-2 py-1" hovered={false}>tab</KeyBox>
                <span className="group-hover:text-black transition-colors duration-200 group-hover:transition-none">Today</span>
              </button>
            </div>
            <input
              ref={endDateInputRef}
              type="text"
              value={customEndDate}
              onChange={handleEndDateChange}
              onKeyDown={handleEndDateKeyDown}
              placeholder="DD/MM/YYYY"
              className="w-full text-3xl font-semibold focus:outline-none placeholder-gray-400"
              maxLength={10}
            />
            {/* Error banner with fixed height */}
            <div className="mt-6 h-12">
              {customDateError && (
                <div className="bg-red-50 text-red-800 px-4 py-3 text-sm">
                  {customDateError}
                </div>
              )}
            </div>

            <div className="flex gap-4 mt-4">
              <div className="flex-1 flex flex-col items-start gap-2">
                <KeyBox className="w-16 h-6 px-2 py-1" hovered={false}>delete</KeyBox>
                <button
                  onClick={() => {
                    setCustomDateStep("startDate");
                    setCustomDateError("");
                  }}
                  className="w-full bg-transparent border border-black text-black px-6 py-3 text-base font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200"
                >
                  Back
                </button>
              </div>
              <div className="flex-1 flex flex-col items-start gap-2">
                <KeyBox className="w-16 h-6 px-2 py-1" hovered={false}>return</KeyBox>
                <button
                  onClick={handleCustomDateSubmit}
                  disabled={!validateCustomDate(customStartDate) || !validateCustomDate(customEndDate)}
                  className="w-full bg-transparent border border-black text-black px-6 py-3 text-base font-semibold cursor-pointer hover:bg-black hover:text-white hover:transition-none transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-black"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
