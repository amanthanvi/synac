import re
import csv
from PyPDF2 import PdfReader

# Regular expression pattern for matching terms and definitions
pattern = re.compile(r"([A-Z\s]+):\s+([^.]+)\.")

# Open the PDF file
with open("NIST.IR.7298r2.pdf", "rb") as file:
    # Create a PDF file reader object
    pdf_reader = PdfReader(file)

    # Create a CSV writer
    with open("terms.csv", "w", newline="") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["Term", "Definition", "Source"])

        # Get the number of pages in the PDF
        num_pages = len(pdf_reader.pages)

        # For each page, extract the text
        for page_num in range(num_pages):
            page = pdf_reader.pages[page_num]
            text = page.extract_text()

            # Use the regular expression to find matches
            matches = pattern.findall(text)

            # For each match, write a row to the CSV file
            for term, definition in matches:
                writer.writerow([term, definition, "NIST.IR.7298r2.pdf"])
