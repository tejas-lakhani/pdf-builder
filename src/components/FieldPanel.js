import React from "react";

const FieldPanel = ({ onFieldSelect, selectedField, mode }) => {
  const fieldTypes = [
    { id: "text", name: "Text", icon: "Tt", color: "bg-blue-500" },
    { id: "signature", name: "Signature", icon: "✍️", color: "bg-green-500" },
    { id: "initials", name: "Initials", icon: "AA", color: "bg-purple-500" },
    { id: "date", name: "Date", icon: "📅", color: "bg-orange-500" },
    { id: "number", name: "Number", icon: "1", color: "bg-red-500" },
    { id: "image", name: "Image", icon: "🖼️", color: "bg-pink-500" },
    { id: "checkbox", name: "Checkbox", icon: "☑️", color: "bg-indigo-500" },
    { id: "multiple", name: "Multiple", icon: "☑️☑️", color: "bg-teal-500" },
    { id: "file", name: "File", icon: "📎", color: "bg-gray-500" },
    { id: "radio", name: "Radio", icon: "🔘", color: "bg-yellow-500" },
    { id: "select", name: "Select", icon: "▼", color: "bg-cyan-500" },
    { id: "cells", name: "Cells", icon: "⊞", color: "bg-lime-500" },
    { id: "stamp", name: "Stamp", icon: "🏷️", color: "bg-amber-500" },
    { id: "payment", name: "Payment", icon: "💳", color: "bg-emerald-500" },
    { id: "phone", name: "Phone", icon: "📞", color: "bg-rose-500" },
  ];

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-screen">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <h2 className="text-lg font-semibold text-gray-800">First Party</h2>
          <button className="ml-auto p-1 hover:bg-gray-100 rounded">
            <svg
              className="w-4 h-4 text-gray-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Selected Field Display */}
        {selectedField && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <div className="text-sm font-medium text-gray-700">
              {selectedField.name}
            </div>
          </div>
        )}
      </div>

      {/* Field Types Grid */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="grid grid-cols-3 gap-3">
          {fieldTypes.map((field) => (
            <button
              key={field.id}
              onClick={() => onFieldSelect(field)}
              className={`p-3 rounded-lg border-2 transition-all duration-200 hover:shadow-md ${
                selectedField?.id === field.id
                  ? "border-primary-500 bg-primary-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <div className="flex flex-col items-center space-y-2">
                <div
                  className={`w-8 h-8 rounded-full ${field.color} flex items-center justify-center text-white text-sm font-medium`}
                >
                  {field.icon}
                </div>
                <span className="text-xs font-medium text-gray-700 text-center">
                  {field.name}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-start space-x-2">
            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
            <span>Draw a text field on the page with a mouse</span>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
            <span>Drag & drop any other field type on the page</span>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
            <span>Click on the field type above to start drawing it</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FieldPanel;
