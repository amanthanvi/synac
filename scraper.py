#!/usr/bin/env python3
import requests
from bs4 import BeautifulSoup, NavigableString
import csv

# List of URLs to scrape
urls = [
    "https://www.sans.org/security-resources/glossary-of-terms/",
]

with open("terms.csv", "w", newline="") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(["Term", "Definition", "Source"])

    for url in urls:
        # Send a GET request to the webpage
        response = requests.get(url)

        # Parse the HTML content of the page with BeautifulSoup
        soup = BeautifulSoup(response.content, "html.parser")

        # Find all tables that contain the glossary
        tables = soup.find_all("table")

        for table in tables:
            # Find all rows in the table body
            rows = table.tbody.find_all("tr")

            # Loop over each row
            for row in rows:
                # For each cell in the row
                for cell in row.find_all("td"):
                    # Find the paragraphs that contain the terms and definitions
                    paragraphs = cell.find_all("p")
                    for paragraph in paragraphs:
                        # The term is in a 'strong' tag and the definition is after the 'br' tag
                        term_tag = paragraph.find("strong")
                        if term_tag:
                            term = term_tag.get_text(strip=True)
                            definition_parts = [
                                str(sibling).strip()
                                for sibling in term_tag.next_siblings
                                if isinstance(sibling, NavigableString)
                            ]
                            definition = " ".join(
                                part for part in definition_parts if part
                            )  # Exclude empty parts
                            if definition:  # Exclude empty definitions
                                writer.writerow([term, definition, url])
